"""
formatter.py — Output formatter for Ecosystem Radar

Converts a Digest object into:
  1. A rich Slack message (Block Kit JSON)
  2. A plain-text email digest
  3. A JSON file for the UI / dashboard
  4. A markdown file for sharing in Notion / docs

Usage:
    from output.formatter import format_digest
    slack_blocks = format_digest(digest, fmt="slack")
    email_text   = format_digest(digest, fmt="email")
    md_text      = format_digest(digest, fmt="markdown")
"""

import json
from datetime import datetime

from models.schemas import Digest, DigestEntry, Signal, Priority

PRIORITY_EMOJI = {
    Priority.HIGH:   "🔴",
    Priority.MEDIUM: "🟡",
    Priority.LOW:    "⚪"
}

SIGNAL_TYPE_LABELS = {
    "competitor_move":       "Competitor Move",
    "partner_announcement":  "Partner Announcement",
    "tech_integration":      "Tech Integration",
    "marketplace_listing":   "Marketplace Listing",
    "joint_customer_story":  "Joint Customer Story",
    "webinar_event":         "Webinar / Event",
    "mssp_motion":           "MSSP Motion",
    "category_trend":        "Category Trend",
    "unknown":               "Signal"
}


# ── Markdown formatter ─────────────────────────────────────────────────────────

def to_markdown(digest: Digest) -> str:
    now = datetime.utcnow().strftime("%B %d, %Y")
    lines = [
        f"# 🛰️ Ecosystem Radar — Daily Digest",
        f"**{now}**  ·  Run ID: `{digest.run_id}`",
        "",
        f"> {digest.summary_narrative}",
        "",
        f"---",
        f"**Coverage:** {digest.watchlist_coverage.get('competitor', 0)} competitor sources · "
        f"{digest.watchlist_coverage.get('partner', 0)} partner sources · "
        f"{digest.total_pages_scanned} pages scanned · "
        f"{digest.total_signals_found} signals found",
        "",
        "---",
        ""
    ]

    for i, entry in enumerate(digest.top_entries, 1):
        s = entry.signal
        p_emoji = PRIORITY_EMOJI.get(s.priority, "⚪")
        type_label = SIGNAL_TYPE_LABELS.get(s.signal_type, "Signal")

        lines += [
            f"## {p_emoji} {i}. {s.title}",
            f"`{type_label}` · **{s.company_name}** · {s.priority.upper()} priority",
            "",
            f"**Summary:** {s.summary}",
            "",
            f"**Why it matters:** {s.why_it_matters}",
        ]

        if s.affected_segment:
            lines.append(f"**Affected segment:** {s.affected_segment}")
        if s.related_partner:
            lines.append(f"**Related partner:** {s.related_partner}")

        lines += [
            f"**Source:** [{s.source_url}]({s.source_url})",
            ""
        ]

        for action in entry.actions:
            lines += [
                f"### ✅ Recommended Action",
                f"**{action.description}**",
                f"- Owner: {action.suggested_owner}",
            ]
            if action.suggested_partners:
                lines.append(f"- Activate: {', '.join(action.suggested_partners)}")
            if action.suggested_accounts:
                lines.append(f"- Target accounts: {', '.join(action.suggested_accounts)}")
            if action.outreach_draft:
                lines += [
                    "",
                    f"**Partner outreach draft:**",
                    f"> {action.outreach_draft}",
                ]
            lines.append("")

        lines += ["---", ""]

    return "\n".join(lines)


# ── Plain-text email formatter ─────────────────────────────────────────────────

def to_email(digest: Digest) -> str:
    now = datetime.utcnow().strftime("%B %d, %Y")
    lines = [
        f"ECOSYSTEM RADAR — DAILY DIGEST",
        f"{now}",
        "=" * 60,
        "",
        digest.summary_narrative,
        "",
        f"Pages scanned: {digest.total_pages_scanned}  |  Signals found: {digest.total_signals_found}",
        ""
    ]

    for i, entry in enumerate(digest.top_entries, 1):
        s = entry.signal
        p_emoji = PRIORITY_EMOJI.get(s.priority, "⚪")
        type_label = SIGNAL_TYPE_LABELS.get(s.signal_type, "Signal")

        lines += [
            f"{p_emoji} SIGNAL {i}: {s.title.upper()}",
            f"Company: {s.company_name}  |  Type: {type_label}  |  Priority: {s.priority.upper()}",
            "",
            f"What happened: {s.summary}",
            f"Why it matters: {s.why_it_matters}",
        ]
        if s.affected_segment:
            lines.append(f"Segment: {s.affected_segment}")
        lines.append(f"Source: {s.source_url}")
        lines.append("")

        for action in entry.actions:
            lines += [
                f"ACTION: {action.description}",
                f"Owner: {action.suggested_owner}",
            ]
            if action.suggested_partners:
                lines.append(f"Partners to activate: {', '.join(action.suggested_partners)}")
            if action.suggested_accounts:
                lines.append(f"Target accounts: {', '.join(action.suggested_accounts)}")
            if action.outreach_draft:
                lines += ["", f"Draft message:", f"  {action.outreach_draft}"]

        lines += ["", "-" * 60, ""]

    lines += ["", "Ecosystem Radar · Obsidian Security Partnerships", ""]
    return "\n".join(lines)


# ── Slack Block Kit formatter ──────────────────────────────────────────────────

def to_slack_blocks(digest: Digest) -> list:
    now = datetime.utcnow().strftime("%B %d, %Y")
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "🛰️ Ecosystem Radar — Daily Digest"}
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*{now}*  |  {digest.total_pages_scanned} pages scanned  |  "
                    f"{digest.total_signals_found} signals found\n\n"
                    f"_{digest.summary_narrative}_"
                )
            }
        },
        {"type": "divider"}
    ]

    for i, entry in enumerate(digest.top_entries, 1):
        s = entry.signal
        p_emoji = PRIORITY_EMOJI.get(s.priority, "⚪")
        type_label = SIGNAL_TYPE_LABELS.get(s.signal_type, "Signal")

        signal_text = (
            f"{p_emoji} *{i}. {s.title}*\n"
            f"`{type_label}` · {s.company_name} · {s.priority.upper()}\n\n"
            f"{s.summary}\n\n"
            f"*Why it matters:* {s.why_it_matters}"
        )
        if s.affected_segment:
            signal_text += f"\n*Segment:* {s.affected_segment}"

        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": signal_text},
            "accessory": {
                "type": "button",
                "text": {"type": "plain_text", "text": "View Source"},
                "url": s.source_url
            }
        })

        for action in entry.actions:
            action_text = (
                f"✅ *Action ({action.action_type.replace('_', ' ').title()}):* "
                f"{action.description}\n"
                f"Owner: {action.suggested_owner}"
            )
            if action.suggested_partners:
                action_text += f"  |  Activate: {', '.join(action.suggested_partners)}"
            if action.outreach_draft:
                action_text += f"\n> _{action.outreach_draft}_"

            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": action_text}
            })

        blocks.append({"type": "divider"})

    return blocks


# ── Main entry point ───────────────────────────────────────────────────────────

def format_digest(digest: Digest, fmt: str = "markdown") -> str:
    """
    Format a Digest into the desired output format.

    Args:
        digest: The Digest object
        fmt:    "markdown" | "email" | "slack" | "json"

    Returns:
        Formatted string (JSON string for "slack" and "json")
    """
    if fmt == "markdown":
        return to_markdown(digest)
    elif fmt == "email":
        return to_email(digest)
    elif fmt == "slack":
        return json.dumps(to_slack_blocks(digest), indent=2)
    elif fmt == "json":
        # Serialize the full Digest as JSON (for API/dashboard use)
        import dataclasses
        def _default(obj):
            if dataclasses.is_dataclass(obj):
                return dataclasses.asdict(obj)
            return str(obj)
        return json.dumps(dataclasses.asdict(digest), indent=2, default=_default)
    else:
        raise ValueError(f"Unknown format: {fmt}. Use markdown, email, slack, or json.")
