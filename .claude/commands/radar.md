# /radar — Ecosystem Radar: Full Pipeline Run

You are running the Ecosystem Radar pipeline for Obsidian Security's Partnerships team. Your job is to act as all four agents — Scout, Interpreter, Ranker, and Activator — using your native web tools.

## Step 1 — Load the watchlist

Read the file `05_EcosystemRadar/config/watchlist.json`. This contains competitors, partners, and marketplace sources to scan.

## Step 2 — Scout (fetch pages)

Use WebFetch on each URL in the watchlist. For each page:
- Extract the meaningful text content
- Decide if it contains any of these signal types:
  - Competitor partnership or alliance announcement
  - New technology integration or marketplace listing
  - Joint customer story, case study, or press release
  - Webinar, event, or conference with a partner
  - MSSP / reseller / VAR program announcement
  - Product launch that affects SaaS security buyers
  - AI security, identity threat, or SaaS access governance themes
- Skip pages with no relevant signals

You don't need to fetch every single URL — prioritize competitor pages and partner pages first, then marketplaces. Aim for 10–15 pages total. Fetch them in parallel where possible.

## Step 3 — Interpret (extract signals)

For each relevant page, extract structured signals. For each signal capture:
- **Title** (max 12 words)
- **Type**: competitor_move | partner_announcement | tech_integration | marketplace_listing | joint_customer_story | webinar_event | mssp_motion | category_trend
- **Summary** (2–3 sentences)
- **Why it matters** for Obsidian's partnerships and positioning
- **Related partner** (one of: Optiv, GuidePoint, Presidio, WWT, EverSec — or null)
- **Affected segment** (e.g. Enterprise FSI, Cloud SaaS, Mid-Market)
- **Confidence** (0.0–1.0)

Obsidian context for interpretation:
- Obsidian detects runtime identity misuse — vs AppOmni/SSPM which focus on posture
- Deep in-app SaaS context — vs CrowdStrike endpoint telemetry
- Fast cross-SaaS incident reconstruction — vs IdP/CASB/SIEM stack
- GTM motions: Access & Privilege Control, SaaS Supply Chain Resilience, SaaS Identity Threat Defense, AI Agent Governance, Compliance (GLBA/NYDFS/DORA)

Drop signals with confidence below 0.5.

## Step 4 — Rank (score signals)

Score each signal using this rubric:
- **HIGH** (0.7–1.0): Competitor gains new partner/integration threatening our positioning; partner adds competing vendor; new co-sell motion; requires action within 1–2 weeks
- **MEDIUM** (0.4–0.69): Worth monitoring, not immediately urgent; moderate relevance events; potential new partner opportunity
- **LOW** (0.0–0.39): Generic marketing, old news, tangential content

Sort all signals by score, descending.

## Step 5 — Activate (generate next actions)

For the top 5–7 HIGH and MEDIUM signals, generate a concrete action:
- **Action type**: partner_outreach | co_sell_trigger | co_marketing | internal_brief | competitive_response | new_partner_intro
- **Specific action** (which partner, why, what to do)
- **Owner** (Partner Manager, AE, Field Marketing, BD)
- **Partners to activate** from: Optiv, GuidePoint, Presidio, WWT, EverSec
- **Target accounts/segments**
- **Outreach draft** — a short Slack message or email opener to the partner rep

Partner context:
- Optiv: Tier 1 national VAR, enterprise FSI and Fortune 500
- GuidePoint: Mid-market to enterprise, deep security practice
- Presidio: Enterprise VAR, cloud security and digital transformation
- WWT: Large enterprise, federal and healthcare
- EverSec: Boutique MSSP, deep Obsidian expertise, SMB to mid-market

## Step 6 — Output

Format the digest as markdown using this structure:

```
# 🛰️ Ecosystem Radar — Daily Digest
**[Date]**

> [1-sentence summary of run: X pages scanned, Y signals found, Z prioritized]

---

## 🔴 1. [Signal Title]
`[Signal Type]` · **[Company]** · HIGH priority

**Summary:** ...
**Why it matters:** ...
**Affected segment:** ...
**Related partner:** ...
**Source:** [URL]

### ✅ Recommended Action
**[Action description]**
- Owner: ...
- Activate: ...
- Target accounts: ...

**Partner outreach draft:**
> [draft message]

---
[repeat for each signal, using 🔴 HIGH / 🟡 MEDIUM / ⚪ LOW]
```

Then write the digest to `05_EcosystemRadar/data/digests/digest-[YYYY-MM-DD].md`.

Tell the user how many pages were fetched, how many signals were found, and how many made the digest.
