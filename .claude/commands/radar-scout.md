# /radar-scout — Ecosystem Radar: Scout a Specific Company

Fetch and scan all watchlist pages for a specific competitor or partner, then report what signals were found.

**Usage:** `/radar-scout AppOmni` or `/radar-scout Optiv`

## Instructions

The company to scout is: $ARGUMENTS

1. Read `05_EcosystemRadar/config/watchlist.json` to find all pages listed for that company.

2. Use WebFetch on each of those pages in parallel.

3. For each page, extract any ecosystem signals (partner announcements, new integrations, co-sell motions, marketplace listings, events, competitive moves, market trends).

4. Report back:
   - Which pages were fetched
   - What signals were found on each page (title, type, summary, why it matters for Obsidian)
   - Overall assessment: is there anything that requires action this week?

If the company isn't in the watchlist, say so and offer to fetch their main website anyway.
