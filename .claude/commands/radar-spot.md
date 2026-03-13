# /radar-spot — Ecosystem Radar: Spot Check a Single URL

Run the full Ecosystem Radar pipeline (Scout → Interpret → Rank → Activate) on a single URL provided as the argument.

**Usage:** `/radar-spot https://appomni.com/blog/`

## Instructions

The URL to analyze is: $ARGUMENTS

1. **Scout**: Use WebFetch to fetch the URL. Extract the meaningful text content (ignore nav, footer, scripts).

2. **Interpret**: Extract all ecosystem signals from the page content using Obsidian's intelligence lens:
   - Obsidian detects runtime identity misuse vs AppOmni/SSPM posture focus
   - Deep in-app SaaS context vs CrowdStrike endpoint telemetry
   - GTM: Access & Privilege Control, SaaS Supply Chain, Identity Threat Defense, AI Agent Governance, FSI Compliance
   - For each signal: title, type, summary, why it matters, related partner, affected segment, confidence

3. **Rank**: Score each signal HIGH / MEDIUM / LOW and sort by priority.

4. **Activate**: For HIGH and MEDIUM signals, generate a specific next action including which Obsidian VAR partner to activate (Optiv, GuidePoint, Presidio, WWT, EverSec), target accounts, and a partner outreach draft.

5. **Output**: Print the formatted signal cards to the chat. If strong signals are found, offer to append them to today's digest file at `05_EcosystemRadar/data/digests/digest-[YYYY-MM-DD].md`.
