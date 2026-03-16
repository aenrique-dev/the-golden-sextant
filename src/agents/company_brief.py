"""
company_brief.py — Account Scout Brief generator

Fires 4 parallel Haiku agents to research any company:
  1. Overview agent  — company snapshot + ecosystem signals
  2. Econ buyers     — CISO, CIO, CFO, VP Security personas
  3. Tech buyers     — SecOps, IAM, SOC, IR personas
  4. Stack agent     — security vendors + partner/competitor presence

Then uses Sonnet to write the verdict + recommended actions,
and renders the full HTML brief to data/briefs/[slug]-scout-brief.html.

Usage:
    from agents.company_brief import run_company_brief
    path = run_company_brief(client, "Snowflake")
    path = run_company_brief(client, "Sutherland Global", url="https://sutherlandglobal.com")
"""

import html as html_lib
import json
import re
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import anthropic

try:
    from duckduckgo_search import DDGS
except ImportError:
    raise ImportError("Run: pip install duckduckgo-search --break-system-packages")

# ── Models ────────────────────────────────────────────────────────────────────

HAIKU  = "claude-haiku-4-5-20251001"
SONNET = "claude-sonnet-4-6"

# ── Config ────────────────────────────────────────────────────────────────────

REQUEST_TIMEOUT = 12
MAX_PAGE_CHARS  = 5000
SEARCH_DELAY    = 0.6
MAX_RESULTS     = 4

OBSIDIAN_CONTEXT = """
Obsidian Security is a SaaS security platform built on a knowledge graph that correlates
identity, access, activity, and posture across SaaS applications.

Key differentiators:
- Runtime SaaS identity detection (vs AppOmni/SSPM posture focus)
- Deep in-app SaaS context (vs CrowdStrike endpoint telemetry)
- Fast cross-SaaS incident reconstruction (vs SIEM/CASB stack)

GTM pillars: Access & Privilege Control, SaaS Supply Chain Resilience,
SaaS Identity Threat Defense, AI Agent Governance, Compliance (GLBA/NYDFS/DORA).
VAR partners: Optiv, GuidePoint, Presidio, WWT, EverSec.
Primary buyers: CISO, SOC Manager, GRC, IAM, Incident Response, App Owners.
"""

# ── Search + fetch helpers ─────────────────────────────────────────────────────

def _ddg_search(query: str, max_results: int = MAX_RESULTS) -> list:
    """Run a DuckDuckGo text search. Returns list of {href, title, body}."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        print(f"  [search] '{query[:60]}' failed: {e}")
        return []


def _fetch_page(url: str) -> str:
    """Fetch a URL and return cleaned body text. Returns '' on failure."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; EcosystemRadarBot/1.0)"}
        resp = requests.get(url, timeout=REQUEST_TIMEOUT, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "iframe"]):
            tag.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()
        return text[:MAX_PAGE_CHARS]
    except Exception:
        return ""


def _gather_research(queries: list, fetch_top: int = 2) -> tuple:
    """
    Run DDG queries, collect snippets, fetch top non-social pages.
    Returns (combined_text, source_url_list).
    """
    SKIP_DOMAINS = {"linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com"}

    all_parts = []
    source_urls = []

    for i, query in enumerate(queries):
        if i > 0:
            time.sleep(SEARCH_DELAY)
        results = _ddg_search(query)
        for r in results:
            snippet = f"[SOURCE: {r.get('href', '')}]\n{r.get('title', '')} — {r.get('body', '')}"
            all_parts.append(snippet)
            if r.get("href"):
                source_urls.append(r["href"])

    # Fetch top pages for richer content (skip social sites)
    fetched = 0
    for url in source_urls:
        if fetched >= fetch_top:
            break
        domain = url.split("/")[2] if "/" in url else ""
        if any(skip in domain for skip in SKIP_DOMAINS):
            continue
        page_text = _fetch_page(url)
        if len(page_text) > 500:
            all_parts.append(f"[FULL PAGE: {url}]\n{page_text}")
            fetched += 1

    combined = "\n\n---\n\n".join(all_parts)
    deduped_sources = list(dict.fromkeys(source_urls))[:8]
    return combined[:MAX_PAGE_CHARS * 3], deduped_sources


# ── Haiku call helper ──────────────────────────────────────────────────────────

def _call_haiku(client: anthropic.Anthropic, system: str, user_content: str):
    """Call Haiku with system + user prompt, return parsed JSON (dict or list)."""
    try:
        msg = client.messages.create(
            model=HAIKU,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user_content}]
        )
        raw = msg.content[0].text.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
        return json.loads(raw)
    except Exception as e:
        print(f"  [Haiku] Parse error: {e}")
        return {}


# ── Agent 1: Company overview + signals ───────────────────────────────────────

OVERVIEW_SYSTEM = f"""You are a sales intelligence analyst at Obsidian Security.

{OBSIDIAN_CONTEXT}

From the research text provided, extract structured company intelligence.

Return a JSON object — no explanation, no markdown:
{{
  "company_name": "official company name",
  "company_type": "e.g. Services Integrator / Managed SOC, Enterprise SaaS, FSI, Healthcare",
  "website": "https://...",
  "snapshot": [
    {{"label": "Company Type", "value": "..."}},
    {{"label": "Size", "value": "e.g. ~60,000 employees globally"}},
    {{"label": "Revenue (est.)", "value": "e.g. ~$1B+"}},
    {{"label": "Key Verticals", "value": "comma-separated"}},
    {{"label": "HQ", "value": "City, State"}},
    {{"label": "Cloud / Tech Partner", "value": "e.g. AWS Premier, Google Cloud"}}
  ],
  "signals": [
    {{
      "title": "signal title (max 12 words)",
      "desc": "2-3 sentences describing what was found",
      "obsidian_angle": "1-2 sentences on why this matters for Obsidian",
      "tags": ["hot", "new", "watch"]
    }}
  ],
  "sources": [
    {{"title": "page or article title", "url": "full URL"}}
  ]
}}

Return 3-7 signals. Focus on AI, SaaS security, identity, cloud, compliance, and M&A signals.
Use only "hot", "new", or "watch" for tags (any combination).
"""


def _run_overview_agent(client: anthropic.Anthropic, company: str, url: Optional[str]) -> dict:
    print(f"  [Agent 1/4] Overview + signals for {company}...")
    queries = [
        f'"{company}" company overview services products',
        f'"{company}" press releases news announcements 2025 2026',
        f'"{company}" AI security OR SaaS OR identity OR compliance 2025 2026',
    ]
    if url:
        domain = url.split("/")[2] if "/" in url else ""
        if domain:
            queries.insert(0, f'site:{domain}')

    text, sources = _gather_research(queries, fetch_top=2)
    result = _call_haiku(client, OVERVIEW_SYSTEM, f"Company: {company}\n\nResearch:\n{text}")

    if not isinstance(result, dict):
        result = {}
    if not result.get("sources"):
        result["sources"] = [{"title": u, "url": u} for u in sources[:6]]
    return result


# ── Agents 2 & 3: People research ─────────────────────────────────────────────

PEOPLE_SYSTEM = f"""You are a sales intelligence analyst at Obsidian Security.

{OBSIDIAN_CONTEXT}

From the research text, identify named individuals at the target company.

Return a JSON array — no explanation, no markdown:
[
  {{
    "name": "First Last",
    "title": "exact job title from research",
    "context": "2-3 sentences: role, tenure, background, and what they own",
    "linkedin": "https://linkedin.com/in/... or null if not confirmed in research",
    "persona": "econ" | "tech" | "risk" | "ai" | "it",
    "obsidian_angle": "which Obsidian use case to lead with for this person",
    "is_primary": true
  }}
]

Only include people you can name with confidence from the research.
Return [] if no named individuals are found.
"""

ECON_TITLES  = ["CISO chief information security officer", "CIO chief information officer",
                "CFO chief financial officer compliance", "VP security head of security"]
TECH_TITLES  = ["VP security operations SOC director threat detection",
                "IAM director identity access management",
                "security engineering cloud security architect",
                "incident response threat vulnerability management"]


def _run_people_agent(client: anthropic.Anthropic, company: str, label: str, titles: list) -> list:
    print(f"  [Agent {label}] People research ({label}) for {company}...")
    queries = []
    for title in titles[:3]:
        queries.append(f'"{company}" {title}')
        time.sleep(SEARCH_DELAY)
    queries.append(f'"{company}" security IT leadership linkedin.com')

    text, _ = _gather_research(queries, fetch_top=1)
    result = _call_haiku(client, PEOPLE_SYSTEM,
                         f"Company: {company}\nPersona group: {label}\n\nResearch:\n{text}")
    return result if isinstance(result, list) else []


# ── Agent 4: Security stack + competitive ─────────────────────────────────────

STACK_SYSTEM = f"""You are a competitive intelligence analyst at Obsidian Security.

{OBSIDIAN_CONTEXT}

Competitors to check for (mark as "not_detected" if absent):
AppOmni, Reco.AI, CrowdStrike Falcon Shield, Microsoft Defender for Cloud Apps,
Grip Security, Valence Security, Nudge Security, Palo Alto Prisma, Zscaler, Netskope.

VAR partners to check for:
Optiv, GuidePoint Security, Presidio, WWT, EverSec, SHI, CDW, Trace3.

From the research text, extract stack and competitive intelligence.

Return a JSON object — no explanation, no markdown:
{{
  "vendor_stack": [
    {{
      "vendor": "vendor name",
      "category": "e.g. SIEM, EDR, IdP, CASB, SaaS Security, ITSM, Cloud",
      "confidence": "high" | "medium" | "low" | "greenfield",
      "notes": "what was found and Obsidian implication",
      "obsidian_note": "short Obsidian positioning note"
    }}
  ],
  "pillar_alignment": [
    {{
      "pillar": "SaaS Identity Threat Defense",
      "stars": 5,
      "rationale": "one sentence"
    }}
  ],
  "partner_presence": {{
    "vars_found": ["partner name"],
    "status": "covered" | "partial" | "none_detected",
    "notes": "what was found",
    "action_note": "Obsidian implication — go direct or bring in a VAR?"
  }},
  "competitor_presence": [
    {{
      "name": "competitor name",
      "status": "entrenched" | "present" | "not_detected",
      "notes": "brief note on what was or was not found"
    }}
  ]
}}

Always include all 5 Obsidian pillars in pillar_alignment, scored 1-5.
If no SSPM/CASB/SaaS security tool is found, add a row: vendor="CASB/SSPM (none detected)",
category="SaaS Security", confidence="greenfield".
"""


def _run_stack_agent(client: anthropic.Anthropic, company: str) -> dict:
    print(f"  [Agent 4/4] Stack + competitive for {company}...")
    queries = [
        f'"{company}" cybersecurity security tools vendors stack',
        f'"{company}" CrowdStrike OR Palo Alto OR IBM QRadar OR Splunk OR Okta security',
        f'"{company}" Optiv OR GuidePoint OR WWT OR Presidio reseller partner cybersecurity',
        f'"{company}" SaaS security OR SSPM OR CASB OR identity threat detection',
    ]
    text, _ = _gather_research(queries, fetch_top=2)
    result = _call_haiku(client, STACK_SYSTEM, f"Company: {company}\n\nResearch:\n{text}")
    return result if isinstance(result, dict) else {}


# ── Sonnet synthesis ──────────────────────────────────────────────────────────

SYNTHESIS_SYSTEM = f"""You are a senior go-to-market strategist at Obsidian Security.

{OBSIDIAN_CONTEXT}

VAR partner context:
- Optiv: Tier 1 national VAR, enterprise FSI and Fortune 500
- GuidePoint: Mid-market to enterprise, strong security practice depth
- Presidio: Enterprise VAR, cloud and digital transformation
- WWT: Large enterprise, federal and healthcare
- EverSec: Boutique MSSP, deep Obsidian expertise, SMB to mid-market

You will receive all available research on a company.
Synthesize it into a verdict, recommended actions, and conversation keywords.

Return a JSON object — no explanation, no markdown:
{{
  "verdict_priority": "High Potential" | "Medium Potential" | "Low Potential" | "Watch List",
  "verdict_headline": "e.g. High Potential — Action Recommended This Week",
  "verdict_body": "2-3 sentences: what makes this account interesting, best entry point, dual prospect/partner angle if relevant",
  "recommended_actions": [
    "Specific action 1 — mention which pillar, which contact, which talking point",
    "Specific action 2",
    "Specific action 3",
    "Specific action 4",
    "Specific action 5"
  ],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}}

Be specific. Mention Obsidian pillar names, real people found in research, and actual GTM angles.
Return ONLY the JSON object.
"""


def _run_synthesis(client: anthropic.Anthropic, company: str, all_research: dict) -> dict:
    print(f"  [Sonnet] Synthesizing verdict and actions for {company}...")
    summary = json.dumps(all_research, indent=2)[:7000]
    try:
        msg = client.messages.create(
            model=SONNET,
            max_tokens=1024,
            system=SYNTHESIS_SYSTEM,
            messages=[{"role": "user", "content": f"Company: {company}\n\nResearch:\n{summary}"}]
        )
        raw = msg.content[0].text.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
        return json.loads(raw)
    except Exception as e:
        print(f"  [Sonnet] Synthesis error: {e}")
        return {
            "verdict_priority": "Medium Potential",
            "verdict_headline": f"Medium Potential — {company} warrants further review",
            "verdict_body": "Research gathered. Review signals and stack findings above for entry points.",
            "recommended_actions": ["Review signals above and engage the relevant VAR partner."],
            "keywords": []
        }


# ── HTML renderer ─────────────────────────────────────────────────────────────

def _e(s) -> str:
    """HTML-escape a value for safe inline use."""
    return html_lib.escape(str(s)) if s else ""


def _stars(n: int) -> str:
    filled = "★" * max(0, min(5, n))
    empty  = '<span class="empty">★</span>' * (5 - max(0, min(5, n)))
    return f'<span class="stars">{filled}{empty}</span>'


def _confidence_badge(conf: str) -> str:
    conf = (conf or "").lower()
    if conf == "high":
        return '<span style="color:var(--green);font-weight:700;">● High</span>'
    if conf == "medium":
        return '<span style="color:var(--amber);font-weight:700;">◐ Medium</span>'
    if conf == "low":
        return '<span style="color:var(--muted);font-weight:700;">○ Low</span>'
    if conf == "greenfield":
        return '<span style="color:var(--green);font-weight:700;">● Greenfield</span>'
    return _e(conf)


def _verdict_icon(priority: str) -> str:
    p = (priority or "").lower()
    if "high" in p:      return "⚡"
    if "medium" in p:    return "🔍"
    if "watch" in p:     return "👀"
    return "📋"


def _persona_badge(persona: str) -> str:
    mapping = {
        "econ": ("badge-econ", "Economic Buyer"),
        "tech": ("badge-tech", "Technical Buyer"),
        "risk": ("badge-risk", "GRC / Compliance"),
        "ai":   ("badge-ai",   "AI & ML Security"),
        "it":   ("badge-tech", "IT / Platform"),
    }
    cls, label = mapping.get(persona, ("badge-tech", persona))
    return f'<span class="person-badge {cls}">{_e(label)}</span>'


def _render_snapshot(snapshot: list) -> str:
    cards = ""
    for item in (snapshot or []):
        cards += f"""
    <div class="snapshot-card">
      <div class="card-label">{_e(item.get("label",""))}</div>
      <div class="card-value">{_e(item.get("value","—"))}</div>
    </div>"""
    return f'<div class="snapshot-grid">{cards}\n  </div>'


def _render_signals(signals: list) -> str:
    if not signals:
        return "<p>No signals found.</p>"
    parts = []
    for i, sig in enumerate(signals, 1):
        tags_html = ""
        for tag in (sig.get("tags") or []):
            t = str(tag).lower()
            if t == "hot":
                tags_html += '<span class="tag tag-hot">🔥 Hot</span>'
            elif t == "new":
                tags_html += '<span class="tag tag-new">New</span>'
            else:
                tags_html += '<span class="tag tag-watch">Watch</span>'
        parts.append(f"""
    <div class="signal">
      <div class="signal-num">{i}</div>
      <div class="signal-body">
        <div class="signal-title">{_e(sig.get("title",""))}</div>
        <div class="signal-desc">{_e(sig.get("desc",""))}</div>
        <div class="signal-why"><strong>Obsidian angle:</strong> {_e(sig.get("obsidian_angle",""))}</div>
        {tags_html}
      </div>
    </div>""")
    return f'<div class="signal-list">{"".join(parts)}\n  </div>'


def _render_pillars(pillars: list) -> str:
    if not pillars:
        return ""
    rows = ""
    for p in pillars:
        rows += f"""
      <tr>
        <td><strong>{_e(p.get("pillar",""))}</strong></td>
        <td>{_stars(p.get("stars", 3))}</td>
        <td>{_e(p.get("rationale",""))}</td>
      </tr>"""
    return f"""
  <table class="pillar-table">
    <thead><tr><th>Pillar</th><th>Fit</th><th>Rationale</th></tr></thead>
    <tbody>{rows}
    </tbody>
  </table>"""


def _render_people(people: list) -> str:
    if not people:
        return "<p>No named contacts identified. Run a LinkedIn search for this company.</p>"
    cards = ""
    for p in sorted(people, key=lambda x: 0 if x.get("is_primary") else 1):
        primary_cls = " primary" if p.get("is_primary") else ""
        linkedin_html = ""
        if p.get("linkedin"):
            linkedin_html = f'<a href="{_e(p["linkedin"])}" target="_blank" class="person-linkedin">↗ LinkedIn</a>'
        badges_html = _persona_badge(p.get("persona", "tech"))
        cards += f"""
    <div class="person-card{primary_cls}">
      <div class="person-top">
        <div>
          <div class="person-name">{_e(p.get("name",""))}</div>
          <div class="person-title">{_e(p.get("title",""))}</div>
        </div>
        {linkedin_html}
      </div>
      <div class="person-context">{_e(p.get("context",""))}</div>
      <div class="person-context" style="margin-top:4px;color:var(--accent);font-size:11px;">{_e(p.get("obsidian_angle",""))}</div>
      <div class="person-badges">{badges_html}</div>
    </div>"""
    return f'<div class="people-grid">{cards}\n  </div>'


def _render_vendor_stack(stack: list) -> str:
    if not stack:
        return "<p>No vendor stack data found.</p>"
    rows = ""
    for v in stack:
        rows += f"""
      <tr>
        <td><strong>{_e(v.get("vendor",""))}</strong></td>
        <td>{_e(v.get("category",""))}</td>
        <td>{_confidence_badge(v.get("confidence",""))}</td>
        <td>{_e(v.get("notes",""))} {f'<strong>{_e(v.get("obsidian_note",""))}</strong>' if v.get("obsidian_note") else ""}</td>
      </tr>"""
    return f"""
  <table class="pillar-table">
    <thead><tr><th>Vendor / Tool</th><th>Category</th><th>Confidence</th><th>Notes</th></tr></thead>
    <tbody>{rows}
    </tbody>
  </table>"""


def _render_presence(partner_presence: dict, competitor_presence: list) -> str:
    # Partner panel
    pp = partner_presence or {}
    vars_found = pp.get("vars_found", [])
    status_icon = "🟡" if pp.get("status") != "covered" else "🟢"
    partner_html = f"""
    <div style="border:1px solid var(--border);border-radius:6px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;">VAR / Partner Presence</div>
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <span style="font-size:18px;flex-shrink:0;">{status_icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--navy);">{"Covered by: " + ", ".join(_e(v) for v in vars_found) if vars_found else "No named VAR documented publicly"}</div>
          <div style="font-size:12px;color:var(--text);margin-top:3px;line-height:1.5;">{_e(pp.get("notes",""))}</div>
          {"" if not pp.get("action_note") else f'<div style="font-size:11px;color:var(--accent);background:rgba(4,49,182,0.06);border-left:2px solid var(--accent);padding:5px 8px;margin-top:6px;border-radius:0 4px 4px 0;line-height:1.45;"><strong>What this means:</strong> {_e(pp.get("action_note",""))}</div>'}
        </div>
      </div>
    </div>"""

    # Competitor panel
    comp_rows = ""
    for c in (competitor_presence or []):
        status = (c.get("status") or "").lower()
        icon = "🔴" if status == "entrenched" else ("🟡" if status == "present" else "🟢")
        comp_rows += f"""
        <div style="display:flex;align-items:flex-start;gap:8px;">
          <span style="font-size:14px;">{icon}</span>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--navy);">{_e(c.get("name",""))}</div>
            <div style="font-size:11px;color:var(--muted);line-height:1.4;">{_e(c.get("notes",""))}</div>
          </div>
        </div>"""

    comp_html = f"""
    <div style="border:1px solid var(--border);border-radius:6px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;">Competitor Presence</div>
      <div style="display:flex;flex-direction:column;gap:8px;">{comp_rows}</div>
    </div>"""

    return f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px;">{partner_html}{comp_html}</div>'


def _render_keywords(keywords: list) -> str:
    if not keywords:
        return ""
    tags = "".join(f'<span class="keyword">{_e(k)}</span>' for k in keywords)
    return f'<div class="keyword-cloud">{tags}</div>'


def _render_actions(actions: list) -> str:
    if not actions:
        return ""
    items = "".join(f"<li>{_e(a)}</li>" for a in actions)
    return f"""
  <div class="action-box">
    <div class="action-title">⚡ Recommended Actions</div>
    <ul>{items}</ul>
  </div>"""


def _render_sources(sources: list) -> str:
    if not sources:
        return ""
    links = "".join(
        f'<a href="{_e(s.get("url","#"))}" target="_blank">{_e(s.get("title") or s.get("url",""))}</a>\n'
        for s in sources if s.get("url")
    )
    return f'<div class="sources-list">{links}</div>'


CSS = """
    :root {
      --accent:  #5565E2;
      --accent2: #61CEF4;
      --navy:    #0B173B;
      --green:   #059669;
      --amber:   #FF9D03;
      --red:     #dc2626;
      --text:    #131313;
      --muted:   #5a5a5a;
      --border:  #e0e0e0;
      --bg:      #F8F8F8;
      --surface: #ffffff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); font-size: 13px; line-height: 1.6; }
    .page { max-width: 860px; margin: 0 auto; padding: 40px 48px 60px; background: var(--surface); min-height: 100vh; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid var(--navy); margin-bottom: 24px; }
    .header-left .label { font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
    .header-left h1 { font-size: 26px; font-weight: 800; color: var(--navy); line-height: 1.15; }
    .header-left h1 span { color: var(--accent); }
    .header-meta { text-align: right; font-size: 11px; color: var(--muted); line-height: 1.8; }
    .header-meta strong { color: var(--text); font-weight: 600; }
    .verdict { background: linear-gradient(135deg, var(--navy) 0%, #1a2d6b 100%); color: #fff; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 16px; }
    .verdict-icon { font-size: 28px; flex-shrink: 0; }
    .verdict-text .verdict-headline { font-size: 14px; font-weight: 700; color: var(--amber); margin-bottom: 3px; }
    .verdict-text p { font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.5; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; margin-top: 24px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .snapshot-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 4px; }
    .snapshot-card { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; }
    .snapshot-card .card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 4px; }
    .snapshot-card .card-value { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.4; }
    .signal-list { display: flex; flex-direction: column; gap: 10px; }
    .signal { border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: flex-start; }
    .signal-num { background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .signal-body .signal-title { font-size: 13px; font-weight: 700; color: var(--navy); margin-bottom: 3px; }
    .signal-body .signal-desc { font-size: 12px; color: var(--text); margin-bottom: 4px; line-height: 1.55; }
    .signal-body .signal-why { font-size: 11px; color: var(--muted); padding-left: 8px; border-left: 2px solid var(--accent2); line-height: 1.5; }
    .signal-body .signal-why strong { color: var(--accent); }
    .tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; margin-top: 5px; margin-right: 4px; }
    .tag-hot   { background: #fef3c7; color: #92400e; }
    .tag-new   { background: #d1fae5; color: #065f46; }
    .tag-watch { background: #ede9fe; color: #5b21b6; }
    .pillar-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .pillar-table th { background: var(--navy); color: #fff; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 12px; text-align: left; }
    .pillar-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .pillar-table tr:last-child td { border-bottom: none; }
    .pillar-table tr:nth-child(even) td { background: var(--bg); }
    .stars { color: var(--amber); font-size: 12px; letter-spacing: -1px; }
    .stars .empty { color: var(--border); }
    .people-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .person-card { border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
    .person-card.primary { border-color: var(--accent); background: rgba(85,101,226,0.04); }
    .person-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .person-name { font-size: 13px; font-weight: 700; color: var(--navy); }
    .person-title { font-size: 11px; color: var(--muted); line-height: 1.4; margin-bottom: 2px; }
    .person-context { font-size: 11px; color: var(--text); line-height: 1.5; }
    .person-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .person-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; }
    .badge-econ { background: #dbeafe; color: #1e40af; }
    .badge-tech { background: #d1fae5; color: #065f46; }
    .badge-risk { background: #ede9fe; color: #5b21b6; }
    .badge-ai   { background: #fef3c7; color: #92400e; }
    .person-linkedin { font-size: 10px; color: var(--accent); text-decoration: none; font-weight: 500; }
    .keyword-cloud { display: flex; flex-wrap: wrap; gap: 7px; }
    .keyword { background: var(--bg); border: 1px solid var(--border); color: var(--navy); font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 14px; }
    .action-box { background: #fffbeb; border: 1px solid var(--amber); border-radius: 6px; padding: 14px 16px; }
    .action-box .action-title { font-size: 12px; font-weight: 700; color: #92400e; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .action-box ul { margin: 0; padding-left: 18px; }
    .action-box ul li { font-size: 12px; color: var(--text); margin-bottom: 4px; line-height: 1.5; }
    .sources-list { display: flex; flex-direction: column; gap: 4px; }
    .sources-list a { font-size: 11px; color: var(--accent); text-decoration: none; }
    .footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .footer-brand { font-size: 11px; font-weight: 700; color: var(--navy); letter-spacing: 0.04em; }
    .footer-brand span { color: var(--accent); }
    .footer-note { font-size: 10px; color: var(--muted); }
    @media print {
      body { background: #fff; }
      .page { padding: 24px 32px 40px; min-height: unset; max-width: 100%; }
      .verdict { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .pillar-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .signal-num { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
"""


def render_html(
    company: str,
    company_type: str,
    website: str,
    overview: dict,
    people: list,
    stack: dict,
    synthesis: dict,
    generated_at: str,
) -> str:
    """Render the full HTML scout brief from structured research data."""

    # Split company name for styled header (last word gets accent color)
    parts = company.strip().split()
    if len(parts) > 1:
        name_html = _e(" ".join(parts[:-1])) + f' <span>{_e(parts[-1])}</span>'
    else:
        name_html = f'<span>{_e(company)}</span>'

    verdict_icon    = _verdict_icon(synthesis.get("verdict_priority", ""))
    verdict_hl      = _e(synthesis.get("verdict_headline", company))
    verdict_body    = _e(synthesis.get("verdict_body", ""))
    signals         = overview.get("signals", [])
    snapshot        = overview.get("snapshot", [])
    sources         = overview.get("sources", [])
    pillars         = stack.get("pillar_alignment", [])
    vendor_stack    = stack.get("vendor_stack", [])
    partner_pres    = stack.get("partner_presence", {})
    comp_pres       = stack.get("competitor_presence", [])
    keywords        = synthesis.get("keywords", [])
    actions         = synthesis.get("recommended_actions", [])

    # Dedupe and merge sources
    all_source_urls = {s.get("url") for s in sources if s.get("url")}

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{_e(company)} — Scout Brief | Obsidian Ecosystem Radar</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>{CSS}</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <div class="label">Obsidian Ecosystem Radar &nbsp;·&nbsp; Scout Brief</div>
      <h1>{name_html}</h1>
    </div>
    <div class="header-meta">
      <div><strong>Date</strong> &nbsp;{_e(generated_at)}</div>
      <div><strong>Category</strong> &nbsp;{_e(company_type or overview.get("company_type", ""))}</div>
      <div><strong>Status</strong> &nbsp;Prospect — Not yet in watchlist</div>
      {"" if not website else f'<div><strong>Website</strong> &nbsp;<a href="{_e(website)}" target="_blank" style="color:var(--accent);text-decoration:none;">{_e(website.replace("https://","").replace("http://","").rstrip("/"))}</a></div>'}
    </div>
  </div>

  <div class="verdict">
    <div class="verdict-icon">{verdict_icon}</div>
    <div class="verdict-text">
      <div class="verdict-headline">{verdict_hl}</div>
      <p>{verdict_body}</p>
    </div>
  </div>

  <div class="section-title">Company Snapshot</div>
  {_render_snapshot(snapshot)}

  <div class="section-title">Ecosystem Signals</div>
  {_render_signals(signals)}

  <div class="section-title">Obsidian Pillar Alignment</div>
  {_render_pillars(pillars)}

  <div class="section-title">Key People to Know</div>
  {_render_people(people)}

  <div class="section-title">Security Vendor Stack</div>
  {_render_vendor_stack(vendor_stack)}

  <div class="section-title">Partner &amp; Competitive Presence</div>
  {_render_presence(partner_pres, comp_pres)}

  <div class="section-title">Keywords to Use</div>
  {_render_keywords(keywords)}

  <div class="section-title">Recommended Actions</div>
  {_render_actions(actions)}

  <div class="section-title">Sources</div>
  {_render_sources(sources)}

  <div class="footer">
    <div class="footer-brand">Obsidian <span>Ecosystem Radar</span></div>
    <div class="footer-note">Generated {_e(generated_at)} &nbsp;·&nbsp; Internal Use Only &nbsp;·&nbsp; Not for distribution</div>
  </div>

</div>
</body>
</html>"""


# ── Main entry point ──────────────────────────────────────────────────────────

def run_company_brief(
    client: anthropic.Anthropic,
    company: str,
    url: Optional[str] = None,
    output_dir: Optional[Path] = None,
) -> Path:
    """
    Research a company and generate a full HTML scout brief.

    Args:
        client:     Anthropic client
        company:    Company name (e.g. "Snowflake", "Sutherland Global")
        url:        Optional company website URL — improves overview research
        output_dir: Where to save the HTML (default: data/briefs/)

    Returns:
        Path to the saved HTML file
    """
    if output_dir is None:
        output_dir = Path(__file__).parent.parent.parent / "data" / "briefs"
    output_dir.mkdir(parents=True, exist_ok=True)

    generated_at = datetime.now().strftime("%B %d, %Y")
    print(f"\n{'='*60}")
    print(f"  🔭  Scout Brief — {company}")
    print(f"  {generated_at}")
    print(f"{'='*60}\n")

    # ── Run 4 agents in parallel ───────────────────────────────────────────────
    overview_result = {}
    econ_people     = []
    tech_people     = []
    stack_result    = {}

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_overview = pool.submit(_run_overview_agent, client, company, url)
        f_econ     = pool.submit(_run_people_agent, client, company, "2/4 Economic Buyers", ECON_TITLES)
        f_tech     = pool.submit(_run_people_agent, client, company, "3/4 Technical Buyers", TECH_TITLES)
        f_stack    = pool.submit(_run_stack_agent, client, company)

        for future in as_completed([f_overview, f_econ, f_tech, f_stack]):
            if future is f_overview:
                overview_result = future.result()
            elif future is f_econ:
                econ_people = future.result()
            elif future is f_tech:
                tech_people = future.result()
            elif future is f_stack:
                stack_result = future.result()

    all_people = econ_people + tech_people

    # ── Sonnet synthesis ───────────────────────────────────────────────────────
    synthesis = _run_synthesis(client, company, {
        "overview":   overview_result,
        "people":     all_people,
        "stack":      stack_result,
    })

    # ── Render HTML ────────────────────────────────────────────────────────────
    company_type = overview_result.get("company_type", "")
    website      = url or overview_result.get("website", "")

    html_content = render_html(
        company      = company,
        company_type = company_type,
        website      = website,
        overview     = overview_result,
        people       = all_people,
        stack        = stack_result,
        synthesis    = synthesis,
        generated_at = generated_at,
    )

    # ── Save ───────────────────────────────────────────────────────────────────
    slug = re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-")
    out_path = output_dir / f"{slug}-scout-brief.html"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"\n{'='*60}")
    print(f"  ✅  Brief saved → {out_path}")
    print(f"{'='*60}\n")

    return out_path
