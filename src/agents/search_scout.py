"""
search_scout.py — Search-based scout using DuckDuckGo

Complements the direct URL fetcher (scout.py) by running keyword searches
for each watchlist company and market trend term, then feeding result URLs
into the existing scout_url() pipeline.

This catches:
  - News that breaks between watchlist URL updates
  - Companies whose direct pages 404 or are bot-blocked (Drata, SHI, etc.)
  - Market trends appearing in new outlets we don't explicitly track

No API key required — uses the free duckduckgo-search package.

Install:
    pip install duckduckgo-search --break-system-packages

Usage:
    from agents.search_scout import run_search_scouts
    pages = run_search_scouts(client, watchlist, seen_urls=already_fetched_urls)
"""

import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import anthropic

try:
    from duckduckgo_search import DDGS
except ImportError:
    raise ImportError("Run: pip install duckduckgo-search --break-system-packages")

from agents.scout import scout_url
from models.schemas import RawPage

# ── Config ─────────────────────────────────────────────────────────────────────

MAX_RESULTS_PER_QUERY = 5    # top N search results per query
MAX_WORKERS           = 4    # parallel URL fetches (lower than direct scout — be polite)
SEARCH_DELAY_SECS     = 0.8  # delay between DDG queries to avoid rate limiting
MAX_KEYWORD_QUERIES   = 8    # cap market_trend_keywords to avoid spamming search


# ── Query builder ──────────────────────────────────────────────────────────────

def _build_queries(watchlist: dict) -> list[tuple[str, str, str]]:
    """
    Build (search_query, company_name, company_type) tuples.

    For each competitor and partner, we run two queries:
      1. Recent announcements / news
      2. Partner, integration, or launch activity

    For market trend keywords, we run a news recency query.

    Returns deduplicated list.
    """
    queries = []
    year = datetime.utcnow().year

    for ctype, section_key in [("competitor", "competitors"), ("partner", "partners")]:
        for entry in watchlist.get(section_key, []):
            name = entry["name"]
            domain = entry.get("domain", "")
            # Announcement / news query
            queries.append((
                f'"{name}" cybersecurity announcement OR partnership OR launch {year}',
                name, ctype
            ))
            # Identity / SaaS specific — more targeted
            queries.append((
                f'site:{domain} OR "{name}" SaaS security identity {year}',
                name, ctype
            ))

    # Market trend keywords — capped to avoid hammering search
    keywords = watchlist.get("market_trend_keywords", [])[:MAX_KEYWORD_QUERIES]
    for kw in keywords:
        queries.append((
            f'"{kw}" news announcement {year}',
            kw, "market_trend"
        ))

    return queries


# ── Search helper ──────────────────────────────────────────────────────────────

def _search_urls(query: str, max_results: int = MAX_RESULTS_PER_QUERY) -> list[str]:
    """Run a DuckDuckGo text search and return result URLs."""
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        return [r["href"] for r in results if r.get("href")]
    except Exception as e:
        print(f"  [search] Query failed '{query[:60]}': {e}")
        return []


# ── Main entry point ───────────────────────────────────────────────────────────

def run_search_scouts(
    client: anthropic.Anthropic,
    watchlist: dict,
    max_workers: int = MAX_WORKERS,
    skip_relevance_check: bool = False,
    seen_urls: set = None
) -> list[RawPage]:
    """
    Run search-based scouting for all watchlist companies and market keywords.

    Deduplicates against `seen_urls` (the set of URLs already fetched by
    the direct scout) so we don't process the same page twice.

    Args:
        client:               Anthropic client (passed to scout_url for relevance check)
        watchlist:            Loaded watchlist dict
        max_workers:          Parallel fetch threads for the URL batch
        skip_relevance_check: Skip Haiku pre-filter (useful for fast testing)
        seen_urls:            URLs already fetched by direct scout — excluded here

    Returns:
        list[RawPage] — pages that passed relevance filtering
    """
    if seen_urls is None:
        seen_urls = set()

    queries = _build_queries(watchlist)
    print(f"[SearchScout] Running {len(queries)} search queries...")

    # Collect unique (url, company_name, company_type) tuples
    fetch_tasks = []
    seen_search_urls = set(seen_urls)

    for i, (query, company_name, company_type) in enumerate(queries):
        urls = _search_urls(query)
        if urls:
            new_urls = [u for u in urls if u not in seen_search_urls]
            for url in new_urls:
                seen_search_urls.add(url)
                fetch_tasks.append((url, company_name, company_type))
        # Polite delay between queries
        if i < len(queries) - 1:
            time.sleep(SEARCH_DELAY_SECS)

    print(f"[SearchScout] {len(fetch_tasks)} unique URLs discovered — fetching...")

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(scout_url, client, url, name, ctype, skip_relevance_check): url
            for url, name, ctype in fetch_tasks
        }
        for future in as_completed(futures):
            url = futures[future]
            try:
                page = future.result()
                if page is not None and not page.fetch_error:
                    results.append(page)
                    print(f"  [+] {page.company_name} — {url[:65]}")
            except Exception as e:
                print(f"  [!] {url[:65]}: {e}")

    print(f"[SearchScout] Done. {len(results)} relevant pages from search.")
    return results
