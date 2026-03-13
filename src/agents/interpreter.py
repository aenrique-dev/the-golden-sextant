"""
interpreter.py — The Interpreter agent (signal extractor / classifier)

Takes RawPage objects from Scout and extracts structured Signal objects.

Uses Haiku for classification (cheap, fast, good enough for structured JSON).
One RawPage can yield multiple Signals (e.g. a blog index page might
contain 3 relevant posts).

For each page it asks:
  - What signals are present?
  - What type is each signal?
  - What is the strategic implication for Obsidian Security?
  - Who / what partner or segment is affected?
"""

import json
import re
import anthropic
from datetime import datetime
from typing import Optional

from models.schemas import RawPage, Signal, SignalType
from memory.store import make_signal_id

INTERPRETER_MODEL = "claude-haiku-4-5-20251001"

OBSIDIAN_CONTEXT = """
Obsidian Security is a SaaS security platform built on a knowledge graph that correlates
identity, access, activity, and posture across SaaS applications. Key differentiators:
- Detects runtime identity misuse (vs AppOmni/SSPM which focus on posture)
- Deep in-app SaaS context (vs CrowdStrike endpoint telemetry)
- Fast cross-SaaS incident reconstruction (vs IdP/CASB/SIEM stack)

Key GTM motions: Access & Privilege Control, SaaS Supply Chain Resilience,
SaaS Identity Threat Defense, AI Agent Governance, Compliance (GLBA/NYDFS/DORA).

Key VAR partners: Optiv, GuidePoint, Presidio, EverSec, WWT.
Primary buyers: CISO, SOC Manager, GRC, IAM, Incident Response, App Owners.
"""

INTERPRETER_PROMPT = f"""You are a partner intelligence analyst at Obsidian Security.

{OBSIDIAN_CONTEXT}

You are given text scraped from a competitor or partner web page.
Your job is to extract any meaningful ecosystem signals.

A "signal" is anything that:
- Shows a competitor strengthening their partner ecosystem
- Shows a partner adding a new vendor or capability that affects our positioning
- Indicates new integrations, marketplace listings, or joint go-to-market
- Reveals co-marketing, co-selling, or MSSP/reseller motions
- Points to emerging market trends relevant to SaaS identity or AI security

Return a JSON array of signals. Each signal must follow this schema exactly:
{{
  "title": "short descriptive title (max 12 words)",
  "signal_type": one of: "competitor_move" | "partner_announcement" | "tech_integration" | "marketplace_listing" | "joint_customer_story" | "webinar_event" | "mssp_motion" | "category_trend",
  "summary": "2-3 sentences describing what happened",
  "why_it_matters": "1-2 sentences on strategic implication for Obsidian and our partnerships",
  "related_partner": "partner name if a specific partner is mentioned, else null",
  "affected_segment": "buyer segment most affected (e.g. Enterprise FSI, Cloud SaaS, Mid-Market), else null",
  "publish_date": "YYYY-MM-DD if findable in the text, else null",
  "confidence": 0.0 to 1.0 — how confident you are this is a real, meaningful signal
}}

Return [] if there are no meaningful signals.
Return only the JSON array — no explanation, no markdown.
"""


def interpret_page(
    client: anthropic.Anthropic,
    page: RawPage
) -> list:
    """
    Extract signals from a single RawPage.
    Returns list[Signal].
    """
    if page.fetch_error:
        return []

    try:
        msg = client.messages.create(
            model=INTERPRETER_MODEL,
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": (
                    f"{INTERPRETER_PROMPT}\n\n"
                    f"COMPANY: {page.company_name} ({page.company_type})\n"
                    f"SOURCE URL: {page.url}\n"
                    f"PAGE TITLE: {page.title}\n\n"
                    f"PAGE TEXT:\n{page.text_content[:3500]}"
                )
            }]
        )

        raw = msg.content[0].text.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()

        signal_dicts = json.loads(raw)
        if not isinstance(signal_dicts, list):
            return []

    except Exception as e:
        print(f"  [Interpreter] Error on {page.url}: {e}")
        return []

    signals = []
    for d in signal_dicts:
        try:
            sid = make_signal_id(page.url, d.get("title", ""))
            s = Signal(
                signal_id=sid,
                company_name=page.company_name,
                company_type=page.company_type,
                source_url=page.url,
                signal_type=d.get("signal_type", SignalType.UNKNOWN),
                title=d.get("title", ""),
                summary=d.get("summary", ""),
                why_it_matters=d.get("why_it_matters", ""),
                detected_at=datetime.utcnow().isoformat(),
                publish_date=d.get("publish_date"),
                related_partner=d.get("related_partner"),
                affected_segment=d.get("affected_segment"),
                confidence=float(d.get("confidence", 0.7))
            )
            signals.append(s)
        except Exception as e:
            print(f"  [Interpreter] Signal parse error: {e}")
            continue

    return signals


def interpret_all(
    client: anthropic.Anthropic,
    pages: list,
    min_confidence: float = 0.5
) -> list:
    """
    Interpret all pages and return filtered list of Signals.

    Args:
        pages:          list[RawPage] from Scout
        min_confidence: drop signals below this confidence threshold
    """
    all_signals = []

    for page in pages:
        page_signals = interpret_page(client, page)
        # Filter by confidence
        page_signals = [s for s in page_signals if s.confidence >= min_confidence]
        all_signals.extend(page_signals)
        if page_signals:
            print(f"  [Interpreter] {page.company_name} → {len(page_signals)} signal(s)")

    print(f"[Interpreter] Done. {len(all_signals)} signals extracted.")
    return all_signals
