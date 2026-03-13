"""
scout.py — The Scout agent (web crawler / page fetcher)

Runs in parallel across all watchlist entries.
Uses Haiku for cheap page relevance pre-filtering before
passing content to the more expensive Interpreter.

Each Scout task:
  1. Fetches a URL (requests + BeautifulSoup)
  2. Extracts clean text (strips nav/footer/scripts)
  3. Asks Haiku: "Does this page contain any meaningful ecosystem signals?"
  4. Returns a RawPage, or None if clearly irrelevant

Parallel execution is handled by the orchestrator via ThreadPoolExecutor.
"""

import re
import time
import hashlib
import anthropic
from datetime import datetime
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    raise ImportError("Run: pip install requests beautifulsoup4 --break-system-packages")

from models.schemas import RawPage

# ── Config ─────────────────────────────────────────────────────────────────────

SCOUT_MODEL     = "claude-haiku-4-5-20251001"   # fast + cheap for fetch/filter
REQUEST_TIMEOUT = 15   # seconds per page fetch
MAX_TEXT_CHARS  = 4000 # truncate body before sending to LLM
MAX_WORKERS     = 6    # parallel fetch threads

RELEVANCE_PROMPT = """You are a pre-filter for a partner intelligence system at Obsidian Security.

Given the scraped text from a web page, decide if it contains ANY of these signal types:
- competitor partnership or alliance announcement
- new technology integration or marketplace listing
- joint customer story, case study, or press release
- webinar, event, or conference with a partner
- MSSP / reseller / VAR program announcement
- product launch or update that affects SaaS security buyers
- AI security, identity threat, or SaaS access governance themes

Respond with ONLY a JSON object:
{
  "is_relevant": true or false,
  "reason": "one sentence explaining why",
  "signal_hints": ["brief phrase 1", "brief phrase 2"]  // up to 3 hints if relevant, else []
}
"""


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fetch_url(url: str) -> tuple[str, str, list]:
    """Fetch a URL and return (title, clean_text, links). Raises on failure."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; EcosystemRadarBot/1.0; "
            "+https://obsidiansecurity.com)"
        )
    }
    resp = requests.get(url, timeout=REQUEST_TIMEOUT, headers=headers)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "aside", "form", "iframe", "noscript"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title else ""
    text  = re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()
    links = [a["href"] for a in soup.find_all("a", href=True)][:50]

    return title, text[:MAX_TEXT_CHARS], links


def _is_relevant(client: anthropic.Anthropic, title: str, text: str) -> tuple[bool, str, list]:
    """
    Ask Haiku whether this page content is relevant.
    Returns (is_relevant, reason, signal_hints).
    """
    import json

    msg = client.messages.create(
        model=SCOUT_MODEL,
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": (
                f"{RELEVANCE_PROMPT}\n\n"
                f"PAGE TITLE: {title}\n\n"
                f"PAGE TEXT:\n{text[:2000]}"
            )
        }]
    )

    raw = msg.content[0].text.strip()

    # Strip markdown code fences if present
    raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()

    try:
        data = json.loads(raw)
        return (
            bool(data.get("is_relevant", False)),
            data.get("reason", ""),
            data.get("signal_hints", [])
        )
    except Exception:
        # If parse fails, be conservative and include the page
        return True, "parse error — included by default", []


# ── Main Scout function ────────────────────────────────────────────────────────

def scout_url(
    client: anthropic.Anthropic,
    url: str,
    company_name: str,
    company_type: str,
    skip_relevance_check: bool = False
) -> Optional[RawPage]:
    """
    Fetch one URL and return a RawPage if relevant, else None.

    Args:
        client:               Anthropic client
        url:                  Full URL to fetch
        company_name:         Company the URL belongs to (e.g. "AppOmni")
        company_type:         "competitor" | "partner" | "marketplace"
        skip_relevance_check: If True, skip Haiku filtering (useful for testing)
    """
    fetched_at = datetime.utcnow().isoformat()

    try:
        title, text, links = _fetch_url(url)
    except Exception as e:
        return RawPage(
            url=url,
            company_name=company_name,
            company_type=company_type,
            fetched_at=fetched_at,
            fetch_error=str(e)
        )

    if not skip_relevance_check:
        is_relevant, reason, hints = _is_relevant(client, title, text)
        if not is_relevant:
            return None  # Scout discards irrelevant pages

    return RawPage(
        url=url,
        company_name=company_name,
        company_type=company_type,
        fetched_at=fetched_at,
        title=title,
        text_content=text,
        links=links
    )


def run_scouts(
    client: anthropic.Anthropic,
    watchlist: dict,
    max_workers: int = MAX_WORKERS,
    skip_relevance_check: bool = False
) -> list:
    """
    Run all Scout tasks in parallel across the watchlist.

    Returns list[RawPage] (only pages that passed relevance filter).
    """
    tasks = []

    for entry in watchlist.get("competitors", []):
        for page_url in entry.get("pages", []):
            tasks.append((page_url, entry["name"], "competitor"))

    for entry in watchlist.get("partners", []):
        for page_url in entry.get("pages", []):
            tasks.append((page_url, entry["name"], "partner"))

    for entry in watchlist.get("marketplaces", []):
        for page_url in entry.get("pages", []):
            tasks.append((page_url, entry["name"], "marketplace"))

    print(f"[Scout] Starting {len(tasks)} fetch tasks with {max_workers} workers...")

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(
                scout_url, client, url, name, ctype, skip_relevance_check
            ): url
            for url, name, ctype in tasks
        }

        for future in as_completed(futures):
            url = futures[future]
            try:
                page = future.result()
                if page is not None:
                    results.append(page)
                    status = "✓" if not page.fetch_error else "✗"
                    print(f"  [{status}] {page.company_name} — {url[:60]}")
            except Exception as e:
                print(f"  [!] Unexpected error for {url}: {e}")

    print(f"[Scout] Done. {len(results)} relevant pages collected.")
    return results
