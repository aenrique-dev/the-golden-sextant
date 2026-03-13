# 🛰️ Ecosystem Radar
### Partner Signal-to-Pipeline Agent
**Team: The Partnership Protocol · Obsidian Security Hackathon 2026**

---

## What It Does

Ecosystem Radar runs parallel AI research agents across competitor and partner websites, extracts meaningful ecosystem signals, scores them by strategic importance, and generates concrete next actions for the Partnerships team.

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
pip install -r requirements.txt --break-system-packages
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

1. Open `sample_output/example-digest.md` — show the target output
2. Run `python run.py --dry-run --print markdown` — show the pipeline executing
3. Walk through the four agent stages: Scout → Interpreter → Ranker → Activator
4. Point to `config/watchlist.json` — "this is all it needs to get started"
5. Show how to add a new competitor: one JSON entry, done
6. Close with the roadmap: CRM integration → account mapping → auto-outreach

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

*Built by The Partnership Protocol for the Obsidian Security AI Hackathon 2026.*
