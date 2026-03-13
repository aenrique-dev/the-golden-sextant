# The Partnership Protocol
### Partner Signal-to-Pipeline Agent
**AI Hackathon 2026**

---

## What It Does

The Partnership Protocol runs parallel AI research agents across competitor and partner websites, extracts meaningful ecosystem signals, scores them by strategic importance, and generates concrete next actions for the Partnerships team.

**Before:** Partner managers manually scan 25+ sources. Most signals get missed. None become pipeline actions.

**After:** A ranked daily digest — 5–7 signals with context, strategic implications, and ready-to-send partner outreach drafts.

---

## Architecture

```
run.py
  └── orchestrator.py          ← main loop, coordinates all agents
        ├── agents/scout.py    ← SCOUT: parallel web fetcher (Haiku)
        ├── agents/interpreter.py  ← INTERPRETER: signal extractor (Haiku)
        ├── agents/ranker.py   ← RANKER: priority scorer (Haiku)
        ├── agents/activator.py    ← ACTIVATOR: action generator (Sonnet)
        ├── memory/store.py    ← STATE: dedup + change detection (JSON)
        ├── models/schemas.py  ← DATA MODELS: Signal, Digest, ActionItem
        └── output/formatter.py    ← OUTPUT: Markdown, Slack, Email, JSON
```

**Model routing:**
- `claude-haiku-4-5-20251001` — Scout, Interpreter, Ranker (cheap + fast)
- `claude-sonnet-4-6` — Activator (strategic judgment, outreach drafts)

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

### 3. Run a dry run (no API key needed — uses mock data)
```bash
python run.py --dry-run --print markdown
```

### 4. Run the real pipeline
```bash
python run.py
```

### 5. See all options
```bash
python run.py --help
```

---

## Output Files

All digests are saved to `data/digests/`:
- `digest-YYYY-MM-DD-{run_id}.md` — Markdown digest
- `digest-YYYY-MM-DD-{run_id}.json` — Full structured JSON (for dashboards/APIs)

State is stored in `data/radar_state.json` for deduplication across runs.

---

## Configuration

Edit `config/watchlist.json` to:
- Add/remove competitor domains and pages
- Add/remove partner domains and pages
- Add/remove marketplace sources
- Update market trend keywords

---

## File Structure

```
05_EcosystemRadar/
├── README.md                    ← you are here
├── requirements.txt
├── run.py                       ← entry point
├── config/
│   └── watchlist.json           ← competitor + partner watchlist
├── src/
│   ├── orchestrator.py          ← main pipeline loop
│   ├── agents/
│   │   ├── scout.py             ← web fetcher (parallel, Haiku)
│   │   ├── interpreter.py       ← signal extractor (Haiku)
│   │   ├── ranker.py            ← priority scorer (Haiku)
│   │   └── activator.py        ← action generator (Sonnet)
│   ├── memory/
│   │   └── store.py             ← state / dedup layer
│   ├── models/
│   │   └── schemas.py           ← data models
│   └── output/
│       └── formatter.py         ← markdown / email / slack / json
├── sample_output/
│   └── example-digest.md        ← example output for demo
└── data/                        ← created at runtime
    ├── digests/                 ← output files
    └── radar_state.json         ← persistent state
```

---

## Demo Script (Hackathon)

1. Open `radar-ui.html` — show the live dashboard with real signals
2. Run `python run.py --dry-run --print markdown` — show the pipeline executing
3. Walk through the four agent stages: Scout → Interpreter → Ranker → Activator
4. Point to `config/watchlist.json` — "this is all it needs to get started"
5. Show how to add a new competitor: one JSON entry, done
6. Close with the roadmap: CRM integration → account mapping → auto-outreach

---

## Deployment

The pipeline is a Python script designed to run on a schedule and write digest JSON to object storage. The UI fetches the latest digest from a public URL.

### Recommended: GitLab CI + Cloudflare R2

**How it works:**
1. GitLab scheduled pipeline runs `python run.py` daily (e.g. 7am)
2. Output JSON is uploaded to a Cloudflare R2 bucket
3. `radar-ui.html` fetches the digest from the R2 public URL

**`.gitlab-ci.yml` skeleton:**
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
    R2_BUCKET: "partnership-protocol"
```

**Required CI/CD variables** (set in GitLab → Settings → CI/CD → Variables):
- `ANTHROPIC_API_KEY` — Anthropic API key
- `CF_API_TOKEN` — Cloudflare API token with R2 write access
- `CF_ACCOUNT_ID` — Cloudflare account ID
- `R2_BUCKET` — R2 bucket name

**Then update the UI** to fetch from R2 instead of local file:
```javascript
// In radar-ui.html, replace the demo fetch URL:
fetch('https://pub-xxxx.r2.dev/demo-digest.json')
```

### Alternatives

| Option | Notes |
|--------|-------|
| **GitHub Actions + S3** | Same pattern, swap GitLab CI for GH Actions and R2 for S3 |
| **AWS Lambda** | Works but 15min timeout is tight for large watchlists |
| **Modal.com** | Best pure-Python serverless option — native cron, no timeout issues |
| **Local cron** | `crontab -e` → `0 7 * * * cd /path && python run.py` — simplest of all |

---

## Roadmap

| Phase | Feature |
|-------|---------|
| ✅ MVP | Web scraping, signal extraction, ranking, action generation |
| Phase 2 | Salesforce account mapping — connect signals to open opps |
| Phase 2 | Slack bot delivery — post digest to #partnerships channel |
| Phase 3 | Automated partner outreach — draft and queue emails |
| Phase 3 | Buying committee mapping — match signals to account contacts |
| Phase 3 | Feedback loop — "was this useful?" thumbs up/down |

---

*Built for the AI Hackathon 2026.*
