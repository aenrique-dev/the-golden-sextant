"""
store.py — Simple file-based memory layer for Ecosystem Radar

Tracks:
  - previously seen signal IDs (deduplication across runs)
  - per-domain last-seen content hashes (change detection)
  - run history metadata

For the hackathon, this is a flat JSON file. In production you'd swap
this for Postgres, Supabase, or a vector store.
"""

import json
import os
import hashlib
from datetime import datetime
from typing import Optional

# Default path — can be overridden via env var RADAR_STATE_PATH
DEFAULT_STATE_FILE = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "radar_state.json"
)


def _load(path: str) -> dict:
    """Load state from disk. Returns empty structure if not found."""
    if not os.path.exists(path):
        return {
            "seen_signals": {},      # signal_id → detected_at
            "page_hashes": {},       # url → content_hash
            "runs": []               # list of run metadata dicts
        }
    with open(path, "r") as f:
        return json.load(f)


def _save(state: dict, path: str):
    """Persist state to disk."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


class StateStore:
    """
    Thin wrapper around the JSON state file.

    Usage:
        store = StateStore()
        if not store.is_seen(signal_id):
            store.mark_seen(signal_id)
            store.save()
    """

    def __init__(self, path: Optional[str] = None):
        self.path = path or os.environ.get("RADAR_STATE_PATH", DEFAULT_STATE_FILE)
        self._state = _load(self.path)

    # ── Signal deduplication ──────────────────────────────────────────────────

    def is_seen(self, signal_id: str) -> bool:
        return signal_id in self._state["seen_signals"]

    def mark_seen(self, signal_id: str):
        self._state["seen_signals"][signal_id] = datetime.utcnow().isoformat()

    def get_seen_count(self) -> int:
        return len(self._state["seen_signals"])

    # ── Page change detection ─────────────────────────────────────────────────

    def has_page_changed(self, url: str, content: str) -> bool:
        """Returns True if the page content has changed since last run."""
        new_hash = hashlib.md5(content.encode()).hexdigest()
        old_hash = self._state["page_hashes"].get(url)
        return old_hash != new_hash

    def update_page_hash(self, url: str, content: str):
        new_hash = hashlib.md5(content.encode()).hexdigest()
        self._state["page_hashes"][url] = new_hash

    # ── Run history ───────────────────────────────────────────────────────────

    def record_run(self, run_id: str, pages_scanned: int, signals_found: int):
        self._state["runs"].append({
            "run_id": run_id,
            "timestamp": datetime.utcnow().isoformat(),
            "pages_scanned": pages_scanned,
            "signals_found": signals_found
        })
        # Keep only last 30 runs in history
        self._state["runs"] = self._state["runs"][-30:]

    def get_last_run(self) -> Optional[dict]:
        if self._state["runs"]:
            return self._state["runs"][-1]
        return None

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self):
        _save(self._state, self.path)

    def reset(self):
        """Wipe all state — useful for testing."""
        self._state = {"seen_signals": {}, "page_hashes": {}, "runs": []}
        self.save()


def make_signal_id(url: str, title: str) -> str:
    """
    Deterministic signal ID from URL + title.
    Used for deduplication across runs.
    """
    raw = f"{url.strip().lower()}::{title.strip().lower()}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]
