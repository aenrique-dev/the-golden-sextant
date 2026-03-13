"""
activator.py — The Activator agent (next-action generator)

This is the "last mile" that makes Ecosystem Radar a pipeline tool,
not just a research bot.

For each high/medium priority signal, the Activator uses Sonnet to:
  1. Generate a concrete next action
  2. Identify which Obsidian VAR partners to activate
  3. Suggest which account segments to target
  4. Optionally draft a short Slack message or partner outreach note

Uses Sonnet (not Haiku) because this step requires real strategic judgment
about Obsidian's partner landscape, GTM motions, and selling context.
"""

import json
import re
import anthropic

from models.schemas import Signal, ActionItem, Priority

ACTIVATOR_MODEL = "claude-sonnet-4-6"   # Judgment-intensive — use Sonnet

OBSIDIAN_PARTNER_CONTEXT = """
Obsidian Security's key VAR and MSSP partners:
- Optiv: Tier 1 national VAR, strong in enterprise FSI and Fortune 500
- GuidePoint Security: Mid-market to enterprise, strong security practice depth
- Presidio: Enterprise VAR, cloud security and digital transformation focus
- WWT: Large enterprise integrator, strong federal and healthcare presence
- EverSec: Boutique MSSP, deep Obsidian expertise, SMB to mid-market

Obsidian's GTM motions partners care about:
1. Access & Privilege Control (shadow AI/IT, SSO bypass, excessive privilege)
2. SaaS Supply Chain Resilience (risky integrations, supply chain compromise)
3. SaaS Identity Threat Defense (account takeover, breach clarity)
4. AI Agent Governance
5. Compliance for FSI (GLBA/NYDFS/DORA)

Standard partner plays:
- Resell: partner resells Obsidian licenses to end customers
- Co-sell: partner brings Obsidian into active deals
- MSSP: partner wraps Obsidian in a managed detection service
- Services: partner delivers implementation, onboarding, and IR services
"""

ACTIVATOR_PROMPT = f"""You are a senior partnership strategist at Obsidian Security.

{OBSIDIAN_PARTNER_CONTEXT}

You will receive a high or medium priority ecosystem signal.
Your job is to generate one concrete, actionable next step for the Partnerships team.

Return a JSON object with these exact fields:
{{
  "action_type": one of: "partner_outreach" | "co_sell_trigger" | "co_marketing" | "internal_brief" | "competitive_response" | "new_partner_intro",
  "description": "1-2 sentences describing the specific action",
  "suggested_owner": "role who should own this (e.g. Partner Manager, AE, Field Marketing, BD)",
  "suggested_partners": ["partner1", "partner2"],  // Obsidian partners most relevant to activate
  "suggested_accounts": ["account or segment description"],  // 1-3 specific targets
  "outreach_draft": "optional 2-4 sentence Slack message to the partner rep OR null"
}}

Be specific. Don't say "reach out to partners." Say which partner, why, and what to say.
Return only the JSON object — no explanation, no markdown.
"""


def generate_action(
    client: anthropic.Anthropic,
    signal: Signal
) -> ActionItem:
    """
    Generate a concrete ActionItem for one Signal.
    """
    try:
        msg = client.messages.create(
            model=ACTIVATOR_MODEL,
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": (
                    f"{ACTIVATOR_PROMPT}\n\n"
                    f"SIGNAL:\n"
                    f"Company: {signal.company_name} ({signal.company_type})\n"
                    f"Type: {signal.signal_type}\n"
                    f"Title: {signal.title}\n"
                    f"Summary: {signal.summary}\n"
                    f"Why it matters: {signal.why_it_matters}\n"
                    f"Affected segment: {signal.affected_segment or 'unknown'}\n"
                    f"Related partner: {signal.related_partner or 'none'}\n"
                    f"Priority: {signal.priority} (score: {signal.priority_score:.2f})"
                )
            }]
        )

        raw = msg.content[0].text.strip()
        raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
        d = json.loads(raw)

        return ActionItem(
            signal_id=signal.signal_id,
            action_type=d.get("action_type", "internal_brief"),
            description=d.get("description", ""),
            suggested_owner=d.get("suggested_owner", "Partner Manager"),
            suggested_partners=d.get("suggested_partners", []),
            suggested_accounts=d.get("suggested_accounts", []),
            outreach_draft=d.get("outreach_draft")
        )

    except Exception as e:
        print(f"  [Activator] Error for signal {signal.signal_id}: {e}")
        # Fallback generic action
        return ActionItem(
            signal_id=signal.signal_id,
            action_type="internal_brief",
            description=f"Review signal from {signal.company_name} and assess partnership implications.",
            suggested_owner="Partner Manager",
            suggested_partners=[],
            suggested_accounts=[]
        )


def activate_top_signals(
    client: anthropic.Anthropic,
    signals: list,
    top_n: int = 7,
    min_priority: str = Priority.MEDIUM
) -> list:
    """
    Generate ActionItems for the top N signals.

    Args:
        signals:      Ranked list[Signal] (highest priority first)
        top_n:        Max number of signals to generate actions for
        min_priority: Skip signals below this priority level
    """
    priority_order = {Priority.HIGH: 2, Priority.MEDIUM: 1, Priority.LOW: 0}
    min_score = priority_order.get(min_priority, 1)

    eligible = [
        s for s in signals
        if priority_order.get(s.priority, 0) >= min_score
    ][:top_n]

    print(f"[Activator] Generating actions for {len(eligible)} signals...")

    from models.schemas import DigestEntry
    entries = []

    for signal in eligible:
        action = generate_action(client, signal)
        entries.append(DigestEntry(signal=signal, actions=[action]))
        print(f"  [✓] Action generated for: {signal.title[:50]}")

    print(f"[Activator] Done. {len(entries)} digest entries ready.")
    return entries
