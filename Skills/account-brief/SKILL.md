---
name: account-brief
description: Generates a print-ready HTML scout brief for any company or prospect. Use when the user says "generate a brief for [company]", "create a scout brief", "build me a one-pager on [company]", "I need a brief before my call with [company]", or wants a shareable PDF-ready account summary with people, stack, signals, and recommended actions. Launches 4 parallel subagents for speed then renders a complete formatted HTML file.
metadata:
  author: Obsidian Security GTM
  version: 2.0.0
  category: sales-intelligence
---

# Account Brief — HTML Scout Brief Generator

You are a senior GTM strategist at Obsidian Security. When this skill is invoked, launch **4 parallel subagents** using the Agent tool to research the company, then render a complete print-ready HTML scout brief. Target completion: under 3 minutes.

---

## Obsidian GTM Context

**Product:** SaaS security platform built on a knowledge graph correlating identity, access, activity, and posture across SaaS applications.

**GTM Pillars:**
1. **Access & Privilege Control** — shadow IT/AI, SSO bypass, excessive privilege, public data exposure
2. **SaaS Supply Chain Resilience** — risky OAuth integrations, supply chain compromise, impact forensics
3. **SaaS Identity Threat Defense** — account takeover, breach clarity, cross-SaaS incident reconstruction
4. **AI Agent Governance** — Copilot, ServiceNow agents, Agentforce, shadow AI, GenAI data leakage
5. **Compliance** — GLBA, NYDFS, DORA, SOC 2, PCI

**Key differentiators:**
- vs AppOmni / SSPM tools: posture visibility vs. runtime identity misuse detection
- vs CrowdStrike Falcon Shield: endpoint telemetry vs. deep in-app SaaS context
- vs SIEM / CASB stack: foundational controls vs. fast cross-SaaS incident reconstruction

---

## Competitor Watchlist

AppOmni (primary SSPM), Reco.AI (SaaS identity/integration risk), CrowdStrike Falcon Shield / Adaptive Shield (SaaS identity threat), Microsoft Defender for Cloud Apps (CASB/SaaS), Grip Security (shadow SaaS/identity), Valence Security (SaaS-to-SaaS OAuth), Nudge Security (shadow SaaS/GenAI), Palo Alto Prisma (CASB/cloud), Zscaler (CASB/cloud proxy), Netskope (CASB), Lumos (shadow SaaS/IGA)

## VAR Partner Watchlist

Optiv (Tier 1, FSI/F500), GuidePoint Security (mid-enterprise), Presidio (enterprise/cloud), WWT (federal/healthcare), EverSec (MSSP, deep Obsidian expertise), Trace3 (enterprise/cloud), SHI (national scale), CDW (national scale), Myriad360 (mid-market)

## Buyer Personas

**Economic:** CISO, VP Security, Head of Security, VP Cybersecurity, VP Cloud Security, CTO, CIO, Head of IT
**Technical:** Director Security Architecture/Engineering, Cloud Security Architect, SOC Manager, Head of SecOps, Director Security Operations, Director IAM, Manager Identity Security, Director SaaS Security, Head Threat Detection & Response, Detection Engineering, IR Lead
**GRC:** Head of GRC, Director GRC, VP Enterprise Risk, Third-Party Risk Director, DPO, Privacy Officer, PCI Owner
**IT/Platform:** Director IT, Salesforce Owner, Workday Owner, M365 Owner, ServiceNow Owner, Snowflake Owner
**AI/Data:** Head AI Security, Director AI Governance, Head Data & AI Platform, Head Digital Transformation

## Market Keywords

SSPM, SaaS Security Posture Management, SaaS posture, SaaS misconfigurations, SaaS attack surface, permission sprawl, shadow admins, dormant SaaS accounts, SaaS identity threat, SaaS ITDR, OAuth token compromise, SaaS-to-SaaS integration risk, AI agent security, AI agent governance, shadow AI, GenAI governance, GenAI data leakage, Copilot security, Agentforce security, SaaS supply chain security, OAuth integrations, third-party SaaS risk, shadow SaaS, SaaS sprawl, NYDFS SaaS, DORA SaaS

---

## Execution — 4 Parallel Subagents

Launch all 4 agents simultaneously using the Agent tool.

### Agent 1 — Company Overview & Signals
Run WebSearches:
1. `"[COMPANY]" company overview industry size employees revenue HQ`
2. `"[COMPANY]" news announcements 2025 2026 AI security SaaS identity compliance`

Return JSON: `{ "company_type", "size", "revenue", "hq", "verticals", "cloud_partner", "website", "signals": [{ "title", "desc", "obsidian_angle", "tag": "hot|new|watch" }] }`
Return 3–6 signals focused on AI, SaaS security, identity, compliance, M&A.

### Agent 2 — Economic Buyers
Run WebSearches:
1. `"[COMPANY]" CISO "VP security" "head of security" "chief information security"`
2. `"[COMPANY]" CIO CTO security leadership site:linkedin.com`

Return JSON array: `[{ "name", "title", "linkedin", "context", "obsidian_angle", "persona": "econ", "is_primary": true }]`
Only include named individuals confirmed in results.

### Agent 3 — Technical Buyers
Run WebSearches:
1. `"[COMPANY]" "SOC" OR "IAM" OR "identity" OR "incident response" director manager security`
2. `"[COMPANY]" security operations "identity access" linkedin site:linkedin.com`

Return JSON array: `[{ "name", "title", "linkedin", "context", "obsidian_angle", "persona": "tech", "is_primary": false }]`
Only include named individuals confirmed in results.

### Agent 4 — Security Stack + Partners + Competitors
Run WebSearches:
1. `"[COMPANY]" cybersecurity tools vendors CrowdStrike Splunk Okta "Palo Alto" "IBM QRadar" Sentinel`
2. `"[COMPANY]" Optiv GuidePoint WWT Presidio EverSec cybersecurity partner`
3. `"[COMPANY]" SSPM CASB "SaaS security" AppOmni identity threat`

Return JSON: `{ "vendor_stack": [{ "vendor", "category", "confidence": "high|medium|low|greenfield", "notes", "obsidian_note" }], "pillar_alignment": [{ "pillar", "stars": 1-5, "rationale" }], "partner_presence": { "vars_found": [], "status", "notes", "action_note" }, "competitor_presence": [{ "name", "status": "entrenched|present|not_detected", "notes" }] }`

If no SSPM/CASB found, add greenfield row. Score all 5 pillars.

---

## HTML Rendering

After all 4 agents return, generate the complete HTML brief below — fully populated with research findings. Output it as a single code block the user can save as `[company]-scout-brief.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>[COMPANY] — Scout Brief | Obsidian Ecosystem Radar</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root{--accent:#5565E2;--accent2:#61CEF4;--navy:#0B173B;--green:#059669;--amber:#FF9D03;--text:#131313;--muted:#5a5a5a;--border:#e0e0e0;--bg:#F8F8F8;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);font-size:13px;line-height:1.6;}
    .page{max-width:860px;margin:0 auto;padding:40px 48px 60px;background:#fff;min-height:100vh;}
    .header{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid var(--navy);margin-bottom:24px;}
    .label{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:4px;}
    h1{font-size:26px;font-weight:800;color:var(--navy);}
    h1 span{color:var(--accent);}
    .meta{text-align:right;font-size:11px;color:var(--muted);line-height:1.8;}
    .verdict{background:linear-gradient(135deg,#0B173B,#1a2d6b);color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:24px;display:flex;gap:16px;align-items:center;}
    .verdict-icon{font-size:28px;flex-shrink:0;}
    .verdict-hl{font-size:14px;font-weight:700;color:var(--amber);margin-bottom:3px;}
    .verdict p{font-size:12px;color:rgba(255,255,255,.85);line-height:1.5;}
    .section{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:24px 0 10px;padding-bottom:4px;border-bottom:1px solid var(--border);}
    .snapshot{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
    .sc{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px 14px;}
    .sc-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px;}
    .sc-val{font-size:13px;font-weight:600;}
    .signals{display:flex;flex-direction:column;gap:10px;}
    .signal{border:1px solid var(--border);border-radius:6px;padding:12px 14px;display:grid;grid-template-columns:20px 1fr;gap:12px;}
    .sig-num{background:var(--accent);color:#fff;font-size:10px;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-top:1px;}
    .sig-title{font-size:13px;font-weight:700;color:var(--navy);margin-bottom:3px;}
    .sig-desc{font-size:12px;margin-bottom:4px;line-height:1.55;}
    .sig-angle{font-size:11px;color:var(--muted);padding-left:8px;border-left:2px solid var(--accent2);line-height:1.5;}
    .sig-angle strong{color:var(--accent);}
    .tag{display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-top:5px;margin-right:4px;}
    .tag-hot{background:#fef3c7;color:#92400e;}
    .tag-new{background:#d1fae5;color:#065f46;}
    .tag-watch{background:#ede9fe;color:#5b21b6;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th{background:var(--navy);color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;padding:8px 12px;text-align:left;}
    td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:top;}
    tr:last-child td{border-bottom:none;}
    tr:nth-child(even) td{background:var(--bg);}
    .stars{color:var(--amber);}
    .stars .empty{color:var(--border);}
    .people{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
    .person{border:1px solid var(--border);border-radius:6px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;}
    .person.primary{border-color:var(--accent);background:rgba(85,101,226,.04);}
    .person-top{display:flex;justify-content:space-between;gap:8px;}
    .person-name{font-size:13px;font-weight:700;color:var(--navy);}
    .person-title{font-size:11px;color:var(--muted);}
    .person-li{font-size:10px;color:var(--accent);text-decoration:none;font-weight:500;}
    .person-ctx{font-size:11px;line-height:1.5;}
    .person-angle{font-size:11px;color:var(--accent);}
    .badge{font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;display:inline-block;margin-top:4px;}
    .b-econ{background:#dbeafe;color:#1e40af;}
    .b-tech{background:#d1fae5;color:#065f46;}
    .b-risk{background:#ede9fe;color:#5b21b6;}
    .b-ai{background:#fef3c7;color:#92400e;}
    .presence{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .pbox{border:1px solid var(--border);border-radius:6px;padding:14px 16px;}
    .pbox-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px;}
    .action-box{background:#fffbeb;border:1px solid var(--amber);border-radius:6px;padding:14px 16px;}
    .action-title{font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px;}
    .action-box ul{margin:0;padding-left:18px;}
    .action-box li{font-size:12px;margin-bottom:4px;line-height:1.5;}
    .keywords{display:flex;flex-wrap:wrap;gap:7px;}
    .kw{background:var(--bg);border:1px solid var(--border);color:var(--navy);font-size:11px;font-weight:500;padding:4px 10px;border-radius:14px;}
    .footer{margin-top:32px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:space-between;}
    .footer-brand{font-size:11px;font-weight:700;color:var(--navy);}
    .footer-brand span{color:var(--accent);}
    .footer-note{font-size:10px;color:var(--muted);}
    @media print{body{background:#fff;}.page{padding:24px 32px 40px;min-height:unset;max-width:100%;}.verdict,.pillar-table th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <div class="label">Obsidian Ecosystem Radar &nbsp;·&nbsp; Scout Brief</div>
      <h1>[COMPANY FIRST WORD(S)] <span>[LAST WORD]</span></h1>
    </div>
    <div class="meta">
      <div><strong>Date</strong> &nbsp;[DATE]</div>
      <div><strong>Category</strong> &nbsp;[COMPANY TYPE]</div>
      <div><strong>Status</strong> &nbsp;Prospect</div>
      <div><strong>Website</strong> &nbsp;<a href="[URL]" style="color:var(--accent);">[URL DISPLAY]</a></div>
    </div>
  </div>

  <div class="verdict">
    <div class="verdict-icon">[⚡ High=⚡ Medium=🔍 Watch=👀]</div>
    <div>
      <div class="verdict-hl">[VERDICT HEADLINE]</div>
      <p>[VERDICT BODY — 2-3 sentences: best entry point, lead pillar, VAR to engage]</p>
    </div>
  </div>

  <div class="section">Company Snapshot</div>
  <div class="snapshot">
    <div class="sc"><div class="sc-label">Company Type</div><div class="sc-val">[VALUE]</div></div>
    <div class="sc"><div class="sc-label">Size</div><div class="sc-val">[VALUE]</div></div>
    <div class="sc"><div class="sc-label">Revenue (est.)</div><div class="sc-val">[VALUE]</div></div>
    <div class="sc"><div class="sc-label">Key Verticals</div><div class="sc-val">[VALUE]</div></div>
    <div class="sc"><div class="sc-label">HQ</div><div class="sc-val">[VALUE]</div></div>
    <div class="sc"><div class="sc-label">Cloud / Tech Partner</div><div class="sc-val">[VALUE]</div></div>
  </div>

  <div class="section">Ecosystem Signals</div>
  <div class="signals">
    <!-- POPULATE: one .signal div per signal from Agent 1 -->
    <div class="signal">
      <div class="sig-num">1</div>
      <div>
        <div class="sig-title">[SIGNAL TITLE]</div>
        <div class="sig-desc">[DESCRIPTION]</div>
        <div class="sig-angle"><strong>Obsidian angle:</strong> [ANGLE]</div>
        <span class="tag tag-hot">🔥 Hot</span>
      </div>
    </div>
  </div>

  <div class="section">Obsidian Pillar Alignment</div>
  <table>
    <thead><tr><th>Pillar</th><th>Fit</th><th>Rationale</th></tr></thead>
    <tbody>
      <!-- POPULATE: from Agent 4 pillar_alignment — use ★ for filled, use .empty span for empty -->
      <tr><td><strong>Access &amp; Privilege Control</strong></td><td class="stars">★★★★<span class="empty">★</span></td><td>[RATIONALE]</td></tr>
      <tr><td><strong>SaaS Supply Chain Resilience</strong></td><td class="stars">★★★<span class="empty">★★</span></td><td>[RATIONALE]</td></tr>
      <tr><td><strong>SaaS Identity Threat Defense</strong></td><td class="stars">★★★★<span class="empty">★</span></td><td>[RATIONALE]</td></tr>
      <tr><td><strong>AI Agent Governance</strong></td><td class="stars">★★★<span class="empty">★★</span></td><td>[RATIONALE]</td></tr>
      <tr><td><strong>Compliance (GLBA/NYDFS/DORA)</strong></td><td class="stars">★★★<span class="empty">★★</span></td><td>[RATIONALE]</td></tr>
    </tbody>
  </table>

  <div class="section">Key People to Know</div>
  <div class="people">
    <!-- POPULATE: one .person div per contact from Agents 2 & 3. Add class "primary" for economic buyers -->
    <div class="person primary">
      <div class="person-top">
        <div><div class="person-name">[NAME]</div><div class="person-title">[TITLE]</div></div>
        <a href="[LINKEDIN]" target="_blank" class="person-li">↗ LinkedIn</a>
      </div>
      <div class="person-ctx">[CONTEXT]</div>
      <div class="person-angle">[OBSIDIAN ANGLE]</div>
      <span class="badge b-econ">Economic Buyer</span>
    </div>
  </div>

  <div class="section">Security Vendor Stack</div>
  <table>
    <thead><tr><th>Vendor / Tool</th><th>Category</th><th>Confidence</th><th>Notes</th></tr></thead>
    <tbody>
      <!-- POPULATE: from Agent 4 vendor_stack. Confidence colors: high=green ●, medium=amber ◐, low=muted ○, greenfield=green ● -->
      <tr>
        <td><strong>[VENDOR]</strong></td>
        <td>[CATEGORY]</td>
        <td><span style="color:var(--green);font-weight:700;">● High</span></td>
        <td>[NOTES] <strong>[OBSIDIAN NOTE]</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="section">Partner &amp; Competitive Presence</div>
  <div class="presence">
    <div class="pbox">
      <div class="pbox-title">VAR / Partner Presence</div>
      <div style="font-size:13px;font-weight:700;color:var(--navy);">[VARS FOUND or "No named VAR documented publicly"]</div>
      <div style="font-size:12px;margin-top:4px;">[PARTNER NOTES]</div>
      <div style="font-size:11px;color:var(--accent);background:rgba(4,49,182,.06);border-left:2px solid var(--accent);padding:5px 8px;margin-top:6px;border-radius:0 4px 4px 0;line-height:1.45;"><strong>What this means:</strong> [ACTION NOTE — go direct or activate a VAR?]</div>
    </div>
    <div class="pbox">
      <div class="pbox-title">Competitor Presence</div>
      <!-- POPULATE: one row per competitor from Agent 4. 🔴 entrenched / 🟡 present / 🟢 not_detected -->
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <span>🟢</span>
        <div><div style="font-size:12px;font-weight:700;">[COMPETITOR]</div><div style="font-size:11px;color:var(--muted);">[NOTES]</div></div>
      </div>
    </div>
  </div>

  <div class="section">Keywords to Use</div>
  <div class="keywords">
    <!-- POPULATE: 10-15 keywords from market keyword list that match this company -->
    <span class="kw">[keyword]</span>
  </div>

  <div class="section">Recommended Actions</div>
  <div class="action-box">
    <div class="action-title">⚡ Recommended Actions</div>
    <ul>
      <!-- POPULATE: 5 specific actions naming pillar, contact, and talking point -->
      <li>[ACTION]</li>
    </ul>
  </div>

  <div class="footer">
    <div class="footer-brand">Obsidian <span>Ecosystem Radar</span></div>
    <div class="footer-note">Generated [DATE] &nbsp;·&nbsp; Internal Use Only &nbsp;·&nbsp; Not for distribution</div>
  </div>

</div>
</body>
</html>
```

---

## Instructions for the User

Tell the user:
1. Copy the HTML code block above
2. Save it as `[company-name]-scout-brief.html`
3. Open in any browser → Cmd+P → Save as PDF

---
*Obsidian Ecosystem Radar · Internal Use Only*
