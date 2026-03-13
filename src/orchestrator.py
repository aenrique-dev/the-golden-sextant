"""
orchestrator.py — Main agent loop for Ecosystem Radar

This is the brain. It coordinates the four sub-agents:
  Scout → Interpreter → Ranker → Activator

And manages:
  - State (deduplication via StateStore)
  - Run lifecycle (logging, error handling)
  - Output delivery (file, Slack, email)

Usage:
    from orchestrator import run_pipeline
    digest = run_pipeline()
"""

import os
import json
import uuid
import anthropic
from datetime import datetime
from pathlib import Path

# ── Agent imports ──────────────────────────────────────────────────────────────
from agents.scout        import run_scouts
from agents.search_scout import run_search_scouts
from agents.interpreter  import interpret_all
from agents.ranker      import rank_signals
from agents.activator   import activate_top_signals
from memory.store       import StateStore
from models.schemas     import Digest
from output.formatter      import format_digest
from output.pptx_formatter import to_pptx

# ── Config ─────────────────────────────────────────────────────────────────────

BASE_DIR    = Path(__file__).parent.parent
CONFIG_PATH = BASE_DIR / "config" / "watchlist.json"
OUTPUT_DIR  = BASE_DIR / "data" / "digests"

# Model routing — change here to swap models globally
SCOUT_MODEL      = "claude-haiku-4-5-20251001"
ACTIVATOR_MODEL  = "claude-sonnet-4-6"


def load_watchlist() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def ensure_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)


def run_pipeline(
    api_key: str = None,
    top_n: int = 7,
    min_confidence: float = 0.5,
    dry_run: bool = False,
    use_search: bool = True,
    output_formats: list = None,
    verbose: bool = True
) -> Digest:
    """
    Run the full Ecosystem Radar pipeline.

    Args:
        api_key:        Anthropic API key (falls back to ANTHROPIC_API_KEY env var)
        top_n:          Max signals to include in digest
        min_confidence: Drop signals below this confidence threshold
        dry_run:        If True, skip LLM calls and use mock data (for testing)
        output_formats: List of formats to write: ["markdown", "email", "json", "slack"]
        verbose:        Print progress to stdout

    Returns:
        Digest object
    """
    if output_formats is None:
        output_formats = ["markdown", "json"]

    ensure_dirs()

    run_id = uuid.uuid4().hex[:8]
    started_at = datetime.utcnow().isoformat()

    if verbose:
        print(f"\n{'='*60}")
        print(f"  🛰️  Ecosystem Radar — Run {run_id}")
        print(f"  {started_at}")
        print(f"{'='*60}\n")

    # ── Initialize Anthropic client ────────────────────────────────────────────
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key and not dry_run:
        raise ValueError(
            "ANTHROPIC_API_KEY not set. "
            "Export it in your shell: export ANTHROPIC_API_KEY=sk-ant-..."
        )

    client = anthropic.Anthropic(api_key=key) if key else None

    # ── Load watchlist and state ───────────────────────────────────────────────
    watchlist = load_watchlist()
    store     = StateStore()

    # ── STEP 1: Scout ──────────────────────────────────────────────────────────
    if verbose:
        print("[Step 1/4] 🔭 Scout — fetching watchlist pages...")

    if dry_run:
        pages = _mock_pages()
    else:
        pages = run_scouts(
            client,
            watchlist,
            skip_relevance_check=False
        )

        if use_search:
            if verbose:
                print("[Step 1b/4] Search Scout — running keyword searches...")
            seen_urls = {p.url for p in pages}
            search_pages = run_search_scouts(
                client,
                watchlist,
                seen_urls=seen_urls
            )
            pages.extend(search_pages)
            if verbose:
                print(f"  → {len(search_pages)} additional pages from search\n")

    # Filter to pages that have actually changed since last run
    changed_pages = []
    for page in pages:
        if page.fetch_error:
            continue
        if store.has_page_changed(page.url, page.text_content):
            changed_pages.append(page)
            store.update_page_hash(page.url, page.text_content)

    if verbose:
        print(f"  → {len(pages)} pages fetched, {len(changed_pages)} changed since last run\n")

    # ── STEP 2: Interpreter ────────────────────────────────────────────────────
    if verbose:
        print("[Step 2/4] 🧠 Interpreter — extracting signals...")

    if dry_run:
        signals = _mock_signals()
    else:
        signals = interpret_all(
            client,
            changed_pages,
            min_confidence=min_confidence
        )

    # Deduplicate against previously seen signals
    new_signals = []
    for s in signals:
        if not store.is_seen(s.signal_id):
            new_signals.append(s)
            s.is_new = True
        else:
            s.is_new = False

    if verbose:
        print(f"  → {len(signals)} signals extracted, {len(new_signals)} are new\n")

    # ── STEP 3: Ranker ─────────────────────────────────────────────────────────
    if verbose:
        print("[Step 3/4] 📊 Ranker — scoring signals...")

    if dry_run or not new_signals:
        ranked = new_signals
    else:
        ranked = rank_signals(client, new_signals)

    if verbose:
        print()

    # ── STEP 4: Activator ──────────────────────────────────────────────────────
    if verbose:
        print("[Step 4/4] 🚀 Activator — generating actions...")

    if dry_run:
        entries = _mock_digest_entries()
    else:
        entries = activate_top_signals(client, ranked, top_n=top_n)

    # ── Build Digest ───────────────────────────────────────────────────────────
    competitor_count = sum(
        1 for e in watchlist.get("competitors", [])
        for _ in e.get("pages", [])
    )
    partner_count = sum(
        1 for e in watchlist.get("partners", [])
        for _ in e.get("pages", [])
    )
    media_count = sum(
        1 for e in watchlist.get("media_sources", [])
        for _ in e.get("pages", [])
    )
    channel_count = sum(
        1 for e in watchlist.get("channel_news_sources", [])
        for _ in e.get("pages", [])
    )
    analyst_count = sum(
        1 for e in watchlist.get("analyst_sources", [])
        for _ in e.get("pages", [])
    )

    summary = _build_summary(entries, len(pages), len(new_signals))

    digest = Digest(
        generated_at=started_at,
        run_id=run_id,
        total_pages_scanned=len(pages),
        total_signals_found=len(new_signals),
        top_entries=entries,
        summary_narrative=summary,
        watchlist_coverage={
            "competitor": competitor_count,
            "partner": partner_count,
            "media": media_count,
            "channel_news": channel_count,
            "analyst": analyst_count
        }
    )

    # ── Persist state ──────────────────────────────────────────────────────────
    for s in new_signals:
        store.mark_seen(s.signal_id)
    store.record_run(run_id, len(pages), len(new_signals))
    store.save()

    # ── Write outputs ──────────────────────────────────────────────────────────
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    for fmt in output_formats:
        if fmt == "pptx":
            out_path = OUTPUT_DIR / f"digest-{date_str}-{run_id}.pptx"
            to_pptx(digest, str(out_path))
        else:
            ext = {"markdown": "md", "email": "txt", "slack": "json", "json": "json"}.get(fmt, fmt)
            out_path = OUTPUT_DIR / f"digest-{date_str}-{run_id}.{ext}"
            with open(out_path, "w") as f:
                f.write(format_digest(digest, fmt=fmt))
        if verbose:
            print(f"\n[Output] {fmt.upper()} → {out_path}")

    if verbose:
        print(f"\n{'='*60}")
        print(f"  ✅ Run complete — {len(entries)} entries in digest")
        print(f"{'='*60}\n")

    return digest


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_summary(entries: list, pages_scanned: int, signals_found: int) -> str:
    """Build a 2-3 sentence exec summary of the digest."""
    if not entries:
        return (
            f"Ecosystem Radar scanned {pages_scanned} pages and found no new signals "
            "requiring immediate action. The partner and competitive landscape appears stable."
        )

    companies = list({e.signal.company_name for e in entries})
    high_count = sum(1 for e in entries if e.signal.priority == "high")

    summary = (
        f"Ecosystem Radar scanned {pages_scanned} pages and surfaced {signals_found} new signals, "
        f"with {len(entries)} prioritized for action. "
    )
    if high_count:
        summary += f"{high_count} high-priority signal(s) from {', '.join(companies[:3])} "
        summary += "require near-term partner response. "
    summary += "Recommended actions are included below with suggested owners and outreach drafts."
    return summary


# ── Mock data for dry-run / demo ───────────────────────────────────────────────

def _mock_pages():
    """Return mock RawPages for dry-run / demo."""
    from models.schemas import RawPage
    ts = datetime.utcnow().isoformat()
    return [
        RawPage(url="https://appomni.com/blog/aws-cosell", company_name="AppOmni",
                company_type="competitor", fetched_at=ts,
                title="AppOmni Expands AWS Co-Sell Partnership",
                text_content="AppOmni today announced an expanded co-sell agreement with AWS."),
        RawPage(url="https://crowdstrike.com/press/falcon-shield-saas", company_name="CrowdStrike",
                company_type="competitor", fetched_at=ts,
                title="CrowdStrike Launches Falcon Shield for SaaS",
                text_content="CrowdStrike announced Falcon Shield, extending endpoint telemetry into SaaS apps."),
        RawPage(url="https://guidepoint.com/partners/new-saas", company_name="GuidePoint Security",
                company_type="partner", fetched_at=ts,
                title="GuidePoint Adds SaaS Security Practice",
                text_content="GuidePoint Security expanded its practice with three new SaaS security vendors."),
        RawPage(url="https://optiv.com/blog/dora-compliance", company_name="Optiv",
                company_type="partner", fetched_at=ts,
                title="Optiv Launches DORA Readiness Assessment",
                text_content="Optiv announced a DORA readiness offering targeting European FSI accounts."),
        RawPage(url="https://wiz.io/blog/ai-security-report", company_name="Wiz",
                company_type="competitor", fetched_at=ts,
                title="Wiz Publishes AI Security Threat Report",
                text_content="Wiz released research on AI agent risks in SaaS environments, citing identity as the top attack vector."),
    ]


def _mock_signals():
    """Return mock Signals for dry-run / demo."""
    from models.schemas import Signal
    from memory.store import make_signal_id
    ts = datetime.utcnow().isoformat()
    return [
        Signal(
            signal_id=make_signal_id("https://appomni.com/blog/aws-cosell", "AppOmni AWS co-sell"),
            company_name="AppOmni", company_type="competitor",
            source_url="https://appomni.com/blog/aws-cosell",
            signal_type="competitor_move",
            title="AppOmni expands AWS co-sell agreement",
            summary="AppOmni announced an expanded co-sell agreement with AWS targeting enterprise SaaS security buyers. The deal includes joint field events and a presence in AWS Marketplace.",
            why_it_matters="Strengthens AppOmni's distribution into AWS-centric enterprise accounts — our primary ICP — and reduces Obsidian's window for displacing them in cloud-first deals.",
            detected_at=ts, related_partner="AWS",
            affected_segment="Enterprise Cloud / AWS-native accounts",
            confidence=0.92, priority="high", priority_score=0.88,
            priority_rationale="Competitor distribution move directly into Obsidian's primary ICP — requires near-term counter-motion with VARs."
        ),
        Signal(
            signal_id=make_signal_id("https://crowdstrike.com/press/falcon-shield-saas", "CrowdStrike Falcon Shield SaaS"),
            company_name="CrowdStrike", company_type="competitor",
            source_url="https://crowdstrike.com/press/falcon-shield-saas",
            signal_type="competitor_move",
            title="CrowdStrike launches Falcon Shield for SaaS environments",
            summary="CrowdStrike announced Falcon Shield, extending its endpoint telemetry into SaaS applications. The product targets identity misuse and lateral movement across M365 and Salesforce.",
            why_it_matters="CrowdStrike is entering Obsidian's core market with massive brand recognition. Partners with existing CrowdStrike relationships may deprioritize Obsidian in SaaS identity conversations.",
            detected_at=ts,
            affected_segment="Enterprise — existing CrowdStrike EDR customers",
            confidence=0.89, priority="high", priority_score=0.85,
            priority_rationale="Direct product incursion into SaaS identity detection — Obsidian's core differentiation — from the market's dominant endpoint vendor."
        ),
        Signal(
            signal_id=make_signal_id("https://guidepoint.com/partners/new-saas", "GuidePoint SaaS practice"),
            company_name="GuidePoint Security", company_type="partner",
            source_url="https://guidepoint.com/partners/new-saas",
            signal_type="partner_announcement",
            title="GuidePoint Security expands SaaS security practice with new vendor additions",
            summary="GuidePoint announced three new SaaS security vendor partnerships as part of a dedicated SaaS security practice launch. Vendors named include a competitor to Obsidian.",
            why_it_matters="GuidePoint is building a formal SaaS practice — this is a co-sell acceleration opportunity if Obsidian is positioned as the identity runtime layer. Risk if a competing vendor gets the anchor slot.",
            detected_at=ts, related_partner="GuidePoint Security",
            affected_segment="Mid-market to enterprise, financial services",
            confidence=0.83, priority="high", priority_score=0.79,
            priority_rationale="Partner is formalizing a SaaS practice — highest-leverage moment to lock in Obsidian as the preferred identity detection vendor before the roster is set."
        ),
        Signal(
            signal_id=make_signal_id("https://optiv.com/blog/dora-compliance", "Optiv DORA readiness"),
            company_name="Optiv", company_type="partner",
            source_url="https://optiv.com/blog/dora-compliance",
            signal_type="co_marketing",
            title="Optiv launches DORA readiness assessment for European FSI clients",
            summary="Optiv announced a DORA compliance readiness assessment offering targeting financial services firms subject to the EU Digital Operational Resilience Act, effective January 2025.",
            why_it_matters="DORA requires SaaS visibility and incident response capabilities that map directly to Obsidian's platform. This is a co-sell entry point for Obsidian in Optiv's European FSI accounts.",
            detected_at=ts, related_partner="Optiv",
            affected_segment="European FSI — DORA-regulated entities",
            confidence=0.78, priority="medium", priority_score=0.68,
            priority_rationale="Optiv-led compliance motion with strong Obsidian fit — medium urgency, good pipeline opportunity with right enablement."
        ),
        Signal(
            signal_id=make_signal_id("https://wiz.io/blog/ai-security-report", "Wiz AI agent threat report"),
            company_name="Wiz", company_type="competitor",
            source_url="https://wiz.io/blog/ai-security-report",
            signal_type="category_trend",
            title="Wiz report frames AI agent identity as top SaaS threat vector for 2026",
            summary="Wiz published research naming AI agent identity sprawl and OAuth token misuse as the leading SaaS attack vector heading into 2026. The report is gaining traction with CISOs.",
            why_it_matters="Validates Obsidian's AI Agent Governance GTM motion with third-party analyst support. Partners can use this report to open conversations where Obsidian is the answer.",
            detected_at=ts,
            affected_segment="Cloud-forward enterprises deploying AI agents (Copilot, Salesforce Agentforce)",
            confidence=0.74, priority="medium", priority_score=0.62,
            priority_rationale="Market validation signal — good enablement asset for partner conversations, not immediately urgent but reinforces Obsidian's AI narrative."
        ),
    ]


def _mock_digest_entries():
    """Return mock DigestEntries for dry-run / demo."""
    from models.schemas import DigestEntry, ActionItem
    signals = _mock_signals()
    return [
        DigestEntry(
            signal=signals[0],
            actions=[ActionItem(
                signal_id=signals[0].signal_id,
                action_type="competitive_response",
                description="Align with Optiv and GuidePoint on AWS-native account targeting this week. Position Obsidian's runtime identity detection as the layer AppOmni's posture visibility doesn't cover.",
                suggested_owner="Partner Manager",
                suggested_partners=["Optiv", "GuidePoint Security"],
                suggested_accounts=["Enterprise FSI on AWS", "Cloud-first SaaS companies", "AWS Marketplace buyers"],
                outreach_draft="Hey [rep] — AppOmni just deepened their AWS co-sell. Worth a quick sync to align on how we position Obsidian in your AWS-focused accounts before they get to your pipeline. Happy to bring the AE team."
            )]
        ),
        DigestEntry(
            signal=signals[1],
            actions=[ActionItem(
                signal_id=signals[1].signal_id,
                action_type="internal_brief",
                description="Brief the field on CrowdStrike Falcon Shield's SaaS move. Arm partners with a crisp differentiation story: endpoint telemetry vs. in-app identity context and cross-SaaS incident reconstruction.",
                suggested_owner="Partner Manager",
                suggested_partners=["Optiv", "Presidio", "WWT"],
                suggested_accounts=["CrowdStrike-heavy enterprise accounts", "Fortune 500 with M365 + Salesforce"],
                outreach_draft="Hey [rep] — CrowdStrike just announced a SaaS play. Want to make sure your team has the differentiation story before this comes up in a deal. Can we do 20 min this week?"
            )]
        ),
        DigestEntry(
            signal=signals[2],
            actions=[ActionItem(
                signal_id=signals[2].signal_id,
                action_type="partner_outreach",
                description="Reach out to GuidePoint practice leadership immediately to secure Obsidian's position as the SaaS identity runtime layer in their new practice. Offer a co-branded launch webinar.",
                suggested_owner="Partner Manager",
                suggested_partners=["GuidePoint Security"],
                suggested_accounts=["GuidePoint's FSI book of business", "Mid-market SaaS-heavy companies"],
                outreach_draft="Hey [rep] — saw the SaaS practice launch, that's huge. We'd love to be your identity detection anchor and co-run a launch webinar together. Do you have 30 min this week to align before the roster is set?"
            )]
        ),
        DigestEntry(
            signal=signals[3],
            actions=[ActionItem(
                signal_id=signals[3].signal_id,
                action_type="co_sell_trigger",
                description="Provide Optiv with a DORA-specific one-pager mapping Obsidian capabilities to DORA Article 9 (ICT risk) and Article 17 (incident detection). Propose joint outreach to their top 10 European FSI accounts.",
                suggested_owner="Partner Manager",
                suggested_partners=["Optiv"],
                suggested_accounts=["European banks under DORA", "UK/EU insurance firms", "Optiv FSI named accounts"],
                outreach_draft="Hey [rep] — your DORA assessment offering is a perfect Obsidian entry point. I can put together a DORA-specific one-pager mapping our platform to the requirements. Worth a quick sync?"
            )]
        ),
        DigestEntry(
            signal=signals[4],
            actions=[ActionItem(
                signal_id=signals[4].signal_id,
                action_type="co_marketing",
                description="Use Wiz's AI agent threat report as a conversation opener with partners. Create a short 'Obsidian response' brief that pairs the Wiz findings with Obsidian's AI Agent Governance GTM motion.",
                suggested_owner="Field Marketing",
                suggested_partners=["GuidePoint Security", "EverSec", "Presidio"],
                suggested_accounts=["Enterprises rolling out Microsoft Copilot", "Salesforce Agentforce early adopters"],
                outreach_draft=None
            )]
        ),
    ]
