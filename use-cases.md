# Ecosystem Radar — Use Cases

> **The core idea:** Every team at Obsidian is manually checking websites, Googling account names, and scrolling LinkedIn to find signals they should be acting on. Ecosystem Radar automates that work and delivers it to the right person, in the right format, before they even knew they needed it.

---

## Use Case 1: The Account Executive

**"I have 10 target accounts. Tell me when something relevant happens at any of them."**

An AE logs into Ecosystem Radar and adds their named accounts to a personal watchlist:

```
CapitalOne · Citi · Morgan Stanley · Truist · Fidelity · Equifax
```

From that moment, Ecosystem Radar runs continuous surveillance on those accounts — scanning public blogs, press releases, LinkedIn posts, job boards, and news mentions. It's not a keyword dump. It's filtered through Obsidian's GTM lens: anything that signals a SaaS security purchase motion, a relevant executive hire, a compliance initiative, or a partner relationship worth knowing about.

Every morning, the AE gets a Slack message:

> **Ecosystem Radar — CapitalOne · Daily Brief**
>
> Morgan Stanley's CISO published a LinkedIn post on SaaS privilege sprawl — references an upcoming audit initiative. Possible active evaluation.
>
> Fidelity posted a job req for a Director of SaaS Security. Title matches our economic buyer ICP.
>
> Truist mentioned "service partner" and "reseller" in two press items this week alongside identity and cloud security vendors.

The AE didn't Google anything. They didn't scroll LinkedIn. They just open Slack and know exactly which account to call first.

### What the tool watches (per account):
- Executive posts and articles mentioning SaaS, identity, cloud security, AI governance
- Job postings for titles in Obsidian's buyer persona list (CISO, Director of SaaS Security, IAM Lead, etc.)
- Press releases and news mentions of "partner," "reseller," "service partner," or named competitors
- Mentions of compliance frameworks (NYDFS, DORA, GLBA, PCI) in public content
- New integrations, vendor announcements, or M&A activity that changes the security landscape at the account

---

## Use Case 2: The Partner Manager

**"I manage 8 VAR partners. Tell me what's happening in their world before they tell me."**

The Partner Manager adds their partner roster — Optiv, GuidePoint, Trace3, WWT, EverSec — and Ecosystem Radar monitors those organizations the same way it monitors competitors.

Every morning, a digest arrives:

> **Ecosystem Radar — Partner Digest · March 13**
>
> Optiv published a new AI security practice page. Services listed: AI Application Threat Modeling, AI Executive Briefing. No vendor listed as the detection layer — this is an open slot. Recommended action: schedule a practice alignment call this week.
>
> GuidePoint is co-hosting a CrowdStrike webinar on identity threats next month. CrowdStrike's Falcon Shield will be featured. Obsidian is not on the agenda. Recommended action: request to be added or run a countering enablement session beforehand.
>
> Trace3 posted two open roles in their cloud security practice. Practice is growing — good moment to propose a joint pipeline review.

The Partner Manager walks into every partner conversation knowing more about that partner's business than the partner expects. That's the edge.

### What the tool watches (per partner):
- New vendor relationships and co-marketing announcements
- Practice area expansions and new service offerings
- Events, webinars, and joint sessions featuring competitors
- MDF announcements, preferred partner programs, and tier changes from other vendors
- Executive movement and new hires on the partner side
- Pipeline signals: job postings for pre-sales roles that indicate active sales capacity

---

## Use Case 3: The Marketing Manager

**"I need to know when the market is talking about our categories — before it's too late to respond."**

The Marketing Manager configures Ecosystem Radar with a set of category keywords and runs it against media sources, analyst publications, and competitor content channels.

Daily digest lands in Slack:

> **Ecosystem Radar — Market Signals · March 13**
>
> CrowdStrike published an interactive prompt injection challenge and framed themselves as the market authority on AI agent security. This is a content positioning move, not a product announcement. We have 48–72 hours to publish a response that stakes our claim on the SaaS-native angle.
>
> Dark Reading ran a feature on SaaS supply chain risk. No vendor quoted. Outreach opportunity for a contributed article or analyst briefing.
>
> Gartner updated the SSPM Market Guide. AppOmni is in. Obsidian is not listed under SSPM — this framing shift needs to be addressed in our AR program.

The Marketing Manager doesn't need to read every publication every day. Ecosystem Radar surfaces the moments that demand a response — and tells them exactly what kind of response to make.

### What the tool watches (for marketing):
- Competitor content: new blogs, whitepapers, campaigns, and product launches
- Media coverage: mentions of Obsidian's categories in Dark Reading, SC Media, The Hacker News, BleepingComputer, VentureBeat
- Analyst signals: Gartner, Forrester, ESG positioning updates for SSPM, SaaS security, identity threat defense
- Channel news: CRN, Channel Futures, MSSP Alert — for partner program moves that affect perception
- Keyword velocity: when a category term (e.g. "AI agent security" or "SaaS supply chain") starts appearing with high frequency, Ecosystem Radar flags it as an emerging narrative

---

## Use Case 4: The Channel Chief / VP of Partnerships

**"Show me the state of the ecosystem — where are the open opportunities and where are the threats?"**

The Channel Chief gets a weekly roll-up view across all monitored sources, organized by urgency. Not a data dump — an executive brief.

> **Ecosystem Radar — Weekly Executive Digest · Week of March 10**
>
> **3 signals require action this week:**
> - Optiv launched an AI security practice with no vendor in the detection layer slot — direct activation opportunity (HIGH)
> - CrowdStrike is bundling Falcon Shield into Falcon Go — active in QBRs now, partners need a battle card (HIGH)
> - AppOmni launched a formal partner program with MDF — our VAR partners will receive outreach (MEDIUM)
>
> **Market is moving on:**
> - AI agent governance and prompt injection (6 articles this week across monitored sources)
> - FSI compliance — NYDFS and DORA SaaS requirements appearing in practitioner content
>
> **Recommended this week:**
> - Partner enablement call with GuidePoint and Optiv on Falcon Shield differentiation
> - Submit a contributed article to Dark Reading on SaaS supply chain risk (category is underserved)
> - Brief Obsidian AR team on Gartner SSPM Market Guide update

This is what the CRO and CEO see. The ecosystem, synthesized. No noise.

---

## What Makes This Different

Most competitive intelligence tools give you data. Ecosystem Radar gives you **action**.

Every signal is scored, prioritized, and paired with a specific next step — which partner to call, which account to prioritize, which content to publish, which conversation to have before the competitor has it first.

It doesn't replace the judgment of the seller, partner manager, or marketer. It gives them the context they need to make that judgment faster, and with more confidence, than anyone else in the room.

---

## Roadmap: What This Becomes

| Phase | Capability |
|-------|-----------|
| **Now** | Manual run via CLI or browser UI — daily digest for partnerships team |
| **Next** | Persona profiles — each user configures their own account/partner watchlist |
| **Next** | Automated daily runs — Slack delivery on a schedule, no manual trigger |
| **Later** | LinkedIn Sales Navigator integration — executive-level signal detection at named accounts |
| **Later** | Salesforce integration — signals automatically attached to relevant account records |
| **Later** | Natural language query — "What's happening at CapitalOne this week?" |

---

*Ecosystem Radar · Obsidian Security Partnerships · Internal*
