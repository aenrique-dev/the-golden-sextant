"""
orchestrator.py — Main agent loop for Ecosystem Radar

This is the brain. It coordinates the four sub-agents:
  Scout → Interpreter → Ranker → Activator

And manages:
  - State (deduplication via StateStore)
  - Run lifecycle (logging, error handling)
  - Output delivery (file, Slack, email)

Usage:
    from orchestrator import run_pipeline
    digest = run_pipeline()
"""

import os
import json
import uuid
import anthropic
from datetime import datetime
from pathlib import Path

# ── Agent imports ──────────────────────────────────────────────────────────────
from agents.scout        import run_scouts
from agents.search_scout import run_search_scouts
from agents.interpreter  import interpret_all
from agents.ranker      import rank_signals
from agents.activator   import activate_top_signals
from memory.store       import StateStore
from models.schemas     import Digest
from output.formatter   import format_digest

# ── Config ─────────────────────────────────────────────────────────────────────

BASE_DIR    = Path(__file__).parent.parent
CONFIG_PATH = BASE_DIR / "config" / "watchlist.json"
OUTPUT_DIR  = BASE_DIR / "data" / "digests"

# Model routing — change here to swap models globally
SCOUT_MODEL      = "claude-haiku-4-5-20251001"
ACTIVATOR_MODEL  = "claude-sonnet-4-6"


def load_watchlist() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def ensure_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)


def run_pipeline(
    api_key: str = None,
    top_n: int = 7,
    min_confidence: float = 0.5,
    dry_run: bool = False,
    use_search: bool = True,
    output_formats: list = None,
    verbose: bool = True
) -> Digest:
    """
    Run the full Ecosystem Radar pipeline.

    Args:
        api_key:        Anthropic API key (falls back to ANTHROPIC_API_KEY env var)
        top_n:          Max signals to include in digest
        min_confidence: Drop signals below this confidence threshold
        dry_run:        If True, skip LLM calls and use mock data (for testing)
        output_formats: List of formats to write: ["markdown", "email", "json", "slack"]
        verbose:        Print progress to stdout

    Returns:
        Digest object
    """
    if output_formats is None:
        output_formats = ["markdown", "json"]

    ensure_dirs()

    run_id = uuid.uuid4().hex[:8]
    started_at = datetime.utcnow().isoformat()

    if verbose:
        print(f"\n{'='*60}")
        print(f"  🛰️  Ecosystem Radar — Run {run_id}")
        print(f"  {started_at}")
        print(f"{'='*60}\n")

    # ── Initialize Anthropic client ────────────────────────────────────────────
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key and not dry_run:
        raise ValueError(
            "ANTHROPIC_API_KEY not set. "
            "Export it in your shell: export ANTHROPIC_API_KEY=sk-ant-..."
        )

    client = anthropic.Anthropic(api_key=key) if key else None

    # ── Load watchlist and state ───────────────────────────────────────────────
    watchlist = load_watchlist()
    store     = StateStore()

    # ── STEP 1: Scout ──────────────────────────────────────────────────────────
    if verbose:
        print("[Step 1/4] 🔭 Scout — fetching watchlist pages...")

    if dry_run:
        pages = _mock_pages()
    else:
        pages = run_scouts(
            client,
            watchlist,
            skip_relevance_check=False
        )

        if use_search:
            if verbose:
                print("[Step 1b/4] Search Scout — running keyword searches...")
            seen_urls = {p.url for p in pages}
            search_pages = run_search_scouts(
                client,
                watchlist,
                seen_urls=seen_urls
            )
            pages.extend(search_pages)
            if verbose:
                print(f"  → {len(search_pages)} additional pages from search\n")

    # Filter to pages that have actually changed since last run
    changed_pages = []
    for page in pages:
        if page.fetch_error:
            continue
        if store.has_page_changed(page.url, page.text_content):
            changed_pages.append(page)
            store.update_page_hash(page.url, page.text_content)

    if verbose:
        print(f"  → {len(pages)} pages fetched, {len(changed_pages)} changed since last run\n")

    # ── STEP 2: Interpreter ────────────────────────────────────────────────────
    if verbose:
        print("[Step 2/4] 🧠 Interpreter — extracting signals...")

    if dry_run:
        signals = _mock_signals()
    else:
        signals = interpret_all(
            client,
            changed_pages,
            min_confidence=min_confidence
        )

    # Deduplicate against previously seen signals
    new_signals = []
    for s in signals:
        if not store.is_seen(s.signal_id):
            new_signals.append(s)
            s.is_new = True
        else:
            s.is_new = False

    if verbose:
        print(f"  → {len(signals)} signals extracted, {len(new_signals)} are new\n")

    # ── STEP 3: Ranker ─────────────────────────────────────────────────────────
    if verbose:
        print("[Step 3/4] 📊 Ranker — scoring signals...")

    if dry_run or not new_signals:
        ranked = new_signals
    else:
        ranked = rank_signals(client, new_signals)

    if verbose:
        print()

    # ── STEP 4: Activator ──────────────────────────────────────────────────────
    if verbose:
        print("[Step 4/4] 🚀 Activator — generating actions...")

    if dry_run:
        entries = _mock_digest_entries()
    else:
        entries = activate_top_signals(client, ranked, top_n=top_n)

    # ── Build Digest ───────────────────────────────────────────────────────────
    competitor_count = sum(
        1 for e in watchlist.get("competitors", [])
        for _ in e.get("pages", [])
    )
    partner_count = sum(
        1 for e in watchlist.get("partners", [])
        for _ in e.get("pages", [])
    )
    media_count = sum(
        1 for e in watchlist.get("media_sources", [])
        for _ in e.get("pages", [])
    )
    channel_count = sum(
        1 for e in watchlist.get("channel_news_sources", [])
        for _ in e.get("pages", [])
    )
    analyst_count = sum(
        1 for e in watchlist.get("analyst_sources", [])
        for _ in e.get("pages", [])
    )

    summary = _build_summary(entries, len(pages), len(new_signals))

    digest = Digest(
        generated_at=started_at,
        run_id=run_id,
        total_pages_scanned=len(pages),
        total_signals_found=len(new_signals),
        top_entries=entries,
        summary_narrative=summary,
        watchlist_coverage={
            "competitor": competitor_count,
            "partner": partner_count,
            "media": media_count,
            "channel_news": channel_count,
            "analyst": analyst_count
        }
    )

    # ── Persist state ──────────────────────────────────────────────────────────
    for s in new_signals:
        store.mark_seen(s.signal_id)
    store.record_run(run_id, len(pages), len(new_signals))
    store.save()

    # ── Write outputs ──────────────────────────────────────────────────────────
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    for fmt in output_formats:
        ext = {"markdown": "md", "email": "txt", "slack": "json", "json": "json"}.get(fmt, fmt)
        out_path = OUTPUT_DIR / f"digest-{date_str}-{run_id}.{ext}"
        with open(out_path, "w") as f:
            f.write(format_digest(digest, fmt=fmt))
        if verbose:
            print(f"\n[Output] {fmt.upper()} → {out_path}")

    if verbose:
        print(f"\n{'='*60}")
        print(f"  ✅ Run complete — {len(entries)} entries in digest")
        print(f"{'='*60}\n")

    return digest


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_summary(entries: list, pages_scanned: int, signals_found: int) -> str:
    """Build a 2-3 sentence exec summary of the digest."""
    if not entries:
        return (
            f"Ecosystem Radar scanned {pages_scanned} pages and found no new signals "
            "requiring immediate action. The partner and competitive landscape appears stable."
        )

    companies = list({e.signal.company_name for e in entries})
    high_count = sum(1 for e in entries if e.signal.priority == "high")

    summary = (
        f"Ecosystem Radar scanned {pages_scanned} pages and surfaced {signals_found} new signals, "
        f"with {len(entries)} prioritized for action. "
    )
    if high_count:
        summary += f"{high_count} high-priority signal(s) from {', '.join(companies[:3])} "
        summary += "require near-term partner response. "
    summary += "Recommended actions are included below with suggested owners and outreach drafts."
    return summary


# ── Mock data for dry-run / demo ───────────────────────────────────────────────

def _mock_pages():
    """Return a minimal list of mock RawPages for testing."""
    from models.schemas import RawPage
    return [
        RawPage(
            url="https://appomni.com/blog/new-aws-partnership",
            company_name="AppOmni",
            company_type="competitor",
            fetched_at=datetime.utcnow().isoformat(),
            title="AppOmni Expands AWS Co-Sell Partnership",
            text_content="AppOmni today announced an expanded co-sell agreement with AWS, enabling joint go-to-market for SaaS security posture management across enterprise cloud accounts."
        )
    ]


def _mock_signals():
    """Return mock Signals for dry-run."""
    from models.schemas import Signal
    from memory.store import make_signal_id
    return [
        Signal(
            signal_id=make_signal_id("https://appomni.com/blog", "AppOmni AWS co-sell"),
            company_name="AppOmni",
            company_type="competitor",
            source_url="https://appomni.com/blog/new-aws-partnership",
            signal_type="competitor_move",
            title="AppOmni expands AWS co-sell agreement",
            summary="AppOmni announced an expanded co-sell agreement with AWS targeting enterprise SaaS security buyers. The deal includes joint field events and a presence in AWS Marketplace.",
            why_it_matters="This strengthens AppOmni's distribution into AWS-centric enterprise accounts — our primary ICP. It reduces Obsidian's window for displacing AppOmni in cloud-first deals.",
            detected_at=datetime.utcnow().isoformat(),
            related_partner="AWS",
            affected_segment="Enterprise Cloud / AWS-native accounts",
            confidence=0.92,
            priority="high",
            priority_score=0.88
        )
    ]


def _mock_digest_entries():
    """Return mock DigestEntries for dry-run."""
    from models.schemas import DigestEntry, ActionItem
    signals = _mock_signals()
    return [
        DigestEntry(
            signal=signals[0],
            actions=[ActionItem(
                signal_id=signals[0].signal_id,
                action_type="competitive_response",
                description="Coordinate with Optiv and GuidePoint on AWS-native account targeting. Position Obsidian's runtime identity detection as complementary to AppOmni's posture visibility.",
                suggested_owner="Partner Manager",
                suggested_partners=["Optiv", "GuidePoint Security"],
                suggested_accounts=["Enterprise FSI on AWS", "Cloud-first SaaS companies"],
                outreach_draft="Hey [Partner] — AppOmni just deepened their AWS co-sell. Want to jump on a quick call to align on how we position Obsidian in your AWS-focused accounts? Happy to bring the AE team."
            )]
        )
    ]
