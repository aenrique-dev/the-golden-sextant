"""
ranker.py — The Ranker agent (priority scorer)

Takes a list of Signals from the Interpreter and assigns:
  - priority: high / medium / low
  - priority_score: 0.0 – 1.0 (for sorting)
  - priority_rationale: one sentence explaining the score

Uses Haiku for batch scoring (cheap). Sends all signals in one
prompt for efficiency, rather than one call per signal.

Scoring criteria:
  - Urgency / recency
  - Direct threat to Obsidian's positioning
  - Partner activation opportunity (can we act on this?)
  - Revenue potential (does this affect pipeline?)
  - Strategic fit with our GTM motions
"""

import json
import re
import anthropic
from typing import Optional

from models.schemas import Signal, Priority

RANKER_MODEL = "claude-haiku-4-5-20251001"

RANKER_PROMPT = """You are a strategic intelligence analyst for the Partnerships team at Obsidian Security.

You will receive a list of ecosystem signals. For each one, assign:
- priority: "high", "medium", or "low"
- priority_score: a float from 0.0 to 1.0 (higher = more important)
- priority_rationale: one sentence explaining the score

Use this scoring rubric:
HIGH (0.7 – 1.0):
  - Competitor gains meaningful new partner or integration that threatens our positioning
  - Partner adds a competing vendor or expands a competing practice
  - New marketplace co-sell motion that shortens competitor sales cycles
  - Signals a market shift directly affecting our ICP buyers
  - Requires an action within the next 1-2 weeks

MEDIUM (0.4 – 0.69):
  - Partner or competitor activity worth monitoring, not immediately urgent
  - Joint webinars or events with moderate relevance
  - Market trend signals — useful but not immediately actionable
  - Potential new partner opportunity to explore

LOW (0.0 – 0.39):
  - Generic marketing content with no direct competitive or partnership angle
  - Old news or duplicate signals
  - Tangentially related content that is unlikely to require action

Return a JSON array. One entry per signal, in the same order as input.
Each entry: {"signal_id": "...", "priority": "...", "priority_score": 0.0, "priority_rationale": "..."}
Return only the JSON array — no explanation, no markdown.
"""


def rank_signals(
    client: anthropic.Anthropic,
    signals: list
) -> list:
    """
    Score and rank all signals. Updates each Signal in place with
    priority, priority_score, and priority_rationale.

    Returns the same list, now sorted by priority_score descending.
    """
    if not signals:
        return []

    # Build a compact signal list for the prompt
    signal_summaries = []
    for s in signals:
        signal_summaries.append({
            "signal_id": s.signal_id,
            "company": s.company_name,
            "type": s.signal_type,
            "title": s.title,
            "summary": s.summary,
            "why_it_matters": s.why_it_matters
        })

    try:
        msg = client.messages.create(
            model=RANKER_MODEL,
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": (
                    f"{RANKER_PROMPT}\n\n"
                    f"SIGNALS TO RANK:\n"
                    f"{json.dumps(signal_summaries, indent=2)}"
                )
            }]
        )

        raw = msg.content[0].text.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
        scores = json.loads(raw)

        # Build lookup by signal_id
        score_map = {item["signal_id"]: item for item in scores}

        for s in signals:
            if s.signal_id in score_map:
                item = score_map[s.signal_id]
                s.priority          = item.get("priority", Priority.MEDIUM)
                s.priority_score    = float(item.get("priority_score", 0.5))
                s.priority_rationale = item.get("priority_rationale", "")

    except Exception as e:
        print(f"  [Ranker] Scoring error: {e}")
        # Fallback: leave defaults in place

    # Sort by score descending
    signals.sort(key=lambda s: s.priority_score, reverse=True)

    high   = sum(1 for s in signals if s.priority == Priority.HIGH)
    medium = sum(1 for s in signals if s.priority == Priority.MEDIUM)
    low    = sum(1 for s in signals if s.priority == Priority.LOW)

    print(f"[Ranker] Done. {high} high / {medium} medium / {low} low priority signals.")
    return signals
