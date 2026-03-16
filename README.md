# Ecosystem Radar
### Account Intelligence & Ecosystem Signal Engine
**AI Hackathon 2026**

---

## What It Does

Ecosystem Radar gives every rep on the account team the intelligence they need to walk into any meeting prepared — without spending hours on research. It runs parallel AI agents to scan competitor websites, partner news, and industry sources, and also deep-dives any company on demand to surface the people, stack, and signals that matter before a call.

**Before:** AEs piece together pre-call intel from browser tabs and memory. Partner managers manually scan dozens of sources hoping not to miss something critical. TAMs have no systematic signal when an account is ready to expand.

**After:** A ready-to-use brief — confirmed security stack, named buyer contacts with LinkedIn links, greenfield coverage gaps, ecosystem moves, and a ready-to-send outreach — for any account or partner, in under 90 seconds.

---

## Two Modes

### 1. Account Scout Brief — `brief.py`
Deep-dive any company on demand. Fires 4 parallel Haiku agents to research the company's overview, buyer personas, security stack, and competitive/partner presence. Synthesizes with Sonnet. Outputs a print-ready HTML brief with live links.

```bash
python brief.py "Snowflake"
python brief.py "Sutherland Global" --url https://www.sutherlandglobal.com --open
```

Output: `data/briefs/[company-slug]-scout-brief.html`

**What's in the brief:**
- Verdict & engagement priority (High / Medium / Watch List)
- Company snapshot — size, revenue, verticals, cloud platform
- 5–7 ecosystem signals with Obsidian-specific angles
- Obsidian pillar alignment scored 1–5
- Named buyer contacts — economic, technical, GRC, AI — with LinkedIn links
- Confirmed security vendor stack with confidence levels
- Greenfield gap detection (no SSPM/CASB = direct Obsidian entry)
- VAR partner coverage status + competitor presence map
- Recommended actions and conversation keyword cloud

---

### 2. Daily Ecosystem Digest — `run.py`
Scans the full watchlist of 60+ competitor, partner, media, and analyst pages. Extracts signals, scores them by urgency, and generates action-ready partner outreach for the top 5–7 findings.

```bash
python run.py
python run.py --dry-run --print markdown
```

Output: `data/digests/digest-YYYY-MM-DD-{run_id}.md` + `.json`

---

## Architecture

```
brief.py                          ← Account Scout Brief (on-demand)
  └── agents/company_brief.py     ← 4 parallel Haiku agents + Sonnet synthesis
        ├── Overview agent         ← company snapshot + signals (Haiku)
        ├── Economic buyers agent  ← CISO, CIO, CFO personas (Haiku)
        ├── Technical buyers agent ← SecOps, IAM, SOC personas (Haiku)
        └── Stack agent            ← vendor stack + competitive (Haiku)
              └── Sonnet synthesis ← verdict + actions + keywords

run.py                            ← Daily Ecosystem Digest (scheduled)
  └── orchestrator.py             ← main loop, coordinates all agents
        ├── agents/scout.py       ← SCOUT: parallel web fetcher (Haiku)
        ├── agents/search_scout.py ← SEARCH SCOUT: DuckDuckGo discovery (Haiku)
        ├── agents/interpreter.py ← INTERPRETER: signal extractor (Haiku)
        ├── agents/ranker.py      ← RANKER: priority scorer (Haiku)
        ├── agents/activator.py   ← ACTIVATOR: action generator (Sonnet)
        ├── memory/store.py       ← STATE: dedup + change detection
        ├── models/schemas.py     ← DATA MODELS: Signal, Digest, ActionItem
        └── output/formatter.py   ← OUTPUT: Markdown, Slack, Email, JSON, PPTX
```

**Model routing:**
- `claude-haiku-4-5-20251001` — all research agents (fast + cost-efficient)
- `claude-sonnet-4-6` — Activator + Brief synthesis (strategic judgment)

---

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set your API key
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 3. Generate a scout brief for any company
```bash
python brief.py "Snowflake" --open
```

### 4. Run the daily ecosystem digest
```bash
python run.py
```

### 5. Test with mock data (no API key needed)
```bash
python run.py --dry-run --print markdown
```

---

## Who Uses This

| Role | How They Use It |
|------|----------------|
| **Account Executive** | Pre-call brief on any prospect — stack, contacts, entry angle — before the first meeting |
| **TAM / CSM** | Expansion signals and account intelligence for renewal and upsell conversations |
| **Partner Manager** | Daily digest of ecosystem moves — who added what, who's competing, what to act on |
| **Sales Leadership** | Territory and account prioritization based on competitive and timing signals |

---

## Configuration

Edit `config/watchlist.json` to:
- Add competitor domains and pages to monitor
- Add partner domains and pages to monitor
- Add media, analyst, and channel news sources
- Update buyer persona titles and market trend keywords

---

## File Structure

```
05_EcosystemRadar/
├── README.md
├── requirements.txt
├── run.py                        ← daily digest runner
├── brief.py                      ← on-demand scout brief runner
├── radar-ui.html                 ← browser-based live dashboard
├── config/
│   └── watchlist.json            ← competitor + partner + source watchlist
├── src/
│   ├── orchestrator.py
│   ├── agents/
│   │   ├── company_brief.py      ← scout brief agent (4 parallel Haiku + Sonnet)
│   │   ├── scout.py
│   │   ├── search_scout.py
│   │   ├── interpreter.py
│   │   ├── ranker.py
│   │   └── activator.py
│   ├── memory/
│   │   └── store.py
│   ├── models/
│   │   └── schemas.py
│   └── output/
│       ├── formatter.py
│       └── pptx_formatter.py
├── data/
│   ├── briefs/                   ← scout brief HTML output
│   └── digests/                  ← daily digest output
└── sample_output/
    └── example-digest.md
```

---

## Demo Script (Hackathon)

1. Open `radar-ui.html` — show the live dashboard with real digest signals
2. Run `python brief.py "Snowflake" --open` — watch 4 agents fire in parallel, open the brief
3. Walk through the brief: confirmed stack, named contacts, greenfield gap, recommended actions
4. Switch to `python run.py --dry-run --print markdown` — show the daily digest pipeline
5. Point to `config/watchlist.json` — "this is all it takes to monitor 60+ sources"
6. Close with the roadmap: CRM integration → auto-outreach → buying committee mapping

---

## Deployment

The daily digest is a Python script designed to run on a schedule and write JSON to object storage. The UI fetches the latest digest from a public URL.

### Recommended: GitLab CI + Cloudflare R2

```yaml
radar-daily-run:
  image: python:3.11-slim
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
  script:
    - pip install -r requirements.txt
    - python run.py --formats json
    - |
      curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/r2/buckets/$R2_BUCKET/objects/demo-digest.json" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data-binary @data/digests/$(ls -t data/digests/*.json | head -1)
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
    CF_API_TOKEN: $CF_API_TOKEN
    CF_ACCOUNT_ID: $CF_ACCOUNT_ID
    R2_BUCKET: "ecosystem-radar"
```

### Alternatives

| Option | Notes |
|--------|-------|
| **GitHub Actions + S3** | Swap GitLab CI for GH Actions and R2 for S3 |
| **Modal.com** | Best pure-Python serverless — native cron, no timeout issues |
| **Local cron** | `crontab -e` → `0 7 * * * cd /path && python run.py` |

---

## Roadmap

| Phase | Feature |
|-------|---------|
| ✅ MVP | Scout brief generator, daily digest, radar UI |
| Phase 2 | Salesforce integration — map signals and briefs to open opps |
| Phase 2 | Slack bot — post digest to #account-team and DM reps on their accounts |
| Phase 3 | LinkedIn Sales Navigator API — monitor named contacts for deal signals |
| Phase 3 | Auto-outreach queue — draft and stage partner emails from digest actions |
| Phase 3 | Feedback loop — "was this useful?" trains signal scoring over time |

---

*Built for the AI Hackathon 2026.*
