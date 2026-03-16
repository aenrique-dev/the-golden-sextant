// ── WATCHLIST ─────────────────────────────────────────────────────────────────
const WATCHLIST = {
  competitors: [
    { name: "AppOmni",            pages: ["https://appomni.com/blog/", "https://appomni.com/partners/"] },
    { name: "CrowdStrike",        pages: ["https://www.crowdstrike.com/blog/", "https://www.crowdstrike.com/partners/"] },
    { name: "Palo Alto Networks", pages: ["https://www.paloaltonetworks.com/blog", "https://www.paloaltonetworks.com/partners"] },
    { name: "Varonis",            pages: ["https://www.varonis.com/blog", "https://www.varonis.com/partners"] },
    { name: "Saviynt",            pages: ["https://saviynt.com/blog/", "https://saviynt.com/press-releases/"] }
  ],
  partners: [
    { name: "Optiv",              pages: ["https://www.optiv.com/insights", "https://www.optiv.com/partners"] },
    { name: "GuidePoint Security",pages: ["https://www.guidepointsecurity.com/blog/", "https://www.guidepointsecurity.com/events/"] },
    { name: "WWT",                pages: ["https://www.wwt.com/blog", "https://www.wwt.com/partners"] },
    { name: "Presidio",           pages: ["https://www.presidio.com/insights/", "https://www.presidio.com/partners/"] },
    { name: "EverSec",            pages: ["https://www.eversecsecurity.com/news/"] }
  ],
  marketplaces: [
    { name: "AWS Marketplace",    pages: ["https://aws.amazon.com/marketplace/search/?searchTerms=SaaS+security"] },
    { name: "Azure Marketplace",  pages: ["https://azuremarketplace.microsoft.com/en-us/marketplace/apps?search=SaaS+security"] }
  ]
};

const CORS_PROXY = "https://api.allorigins.win/raw?url=";

const SYSTEM_PROMPT = `You are the Ecosystem Radar intelligence engine for Obsidian Security's Partnerships team.

OBSIDIAN CONTEXT:
- Obsidian Security: SaaS security platform built on a knowledge graph correlating identity, access, activity, and posture across SaaS apps
- Key differentiators: runtime identity misuse detection (vs AppOmni/SSPM posture); deep in-app SaaS context (vs CrowdStrike endpoint); fast cross-SaaS incident reconstruction (vs IdP/CASB/SIEM)
- GTM motions: Access & Privilege Control, SaaS Supply Chain Resilience, SaaS Identity Threat Defense, AI Agent Governance, FSI Compliance (GLBA/NYDFS/DORA)
- Key VAR partners: Optiv (Tier 1 national, FSI/F500), GuidePoint (mid-market to enterprise), Presidio (enterprise cloud), WWT (federal/healthcare), EverSec (MSSP, deep Obsidian expertise)

You will receive scraped content from competitor and partner web pages.
Your job is to run the full Scout → Interpret → Rank → Activate pipeline and return a structured JSON response.

For each page of content provided, extract any meaningful ecosystem signals. A signal is:
- A competitor gaining a new partner, integration, or marketplace listing
- A partner adding a competing vendor or expanding a competing practice
- A joint event, webinar, or co-marketing motion
- An MSSP/reseller program announcement
- A product launch affecting SaaS identity or AI security buyers
- A market trend relevant to our ICP

Then rank each signal HIGH / MEDIUM / LOW:
- HIGH: Competitor threatens our positioning, requires action within 1-2 weeks
- MEDIUM: Worth monitoring, moderate urgency
- LOW: Tangential, generic marketing

For HIGH and MEDIUM signals, generate a specific action: which partner to activate, what to do, and a 2-3 sentence Slack/email outreach draft to the partner rep.

Return ONLY a valid JSON object with this exact structure:
{
  "pages_scanned": <number>,
  "pages_with_signals": <number>,
  "signals_found": <number>,
  "digest_summary": "<1-2 sentence summary of the run>",
  "signals": [
    {
      "title": "<max 12 words>",
      "company": "<company name>",
      "company_type": "competitor|partner|marketplace",
      "signal_type": "competitor_move|partner_announcement|tech_integration|marketplace_listing|joint_customer_story|webinar_event|mssp_motion|category_trend",
      "summary": "<2-3 sentences>",
      "why_it_matters": "<1-2 sentences on strategic implication for Obsidian>",
      "related_partner": "<Optiv|GuidePoint Security|Presidio|WWT|EverSec or null>",
      "affected_segment": "<segment or null>",
      "source_url": "<url>",
      "priority": "high|medium|low",
      "priority_score": <0.0-1.0>,
      "priority_rationale": "<one sentence>",
      "action_type": "partner_outreach|co_sell_trigger|co_marketing|internal_brief|competitive_response|new_partner_intro",
      "action_description": "<specific action, 1-2 sentences>",
      "suggested_owner": "<role>",
      "suggested_partners": ["<partner name>"],
      "suggested_accounts": ["<account or segment>"],
      "outreach_draft": "<2-3 sentence message to partner rep, or null>"
    }
  ]
}

Only include signals with confidence > 0.5. Return [] for signals if nothing meaningful is found.`;

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentDigest = null;
let isRunning = false;

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const key = localStorage.getItem('er_api_key');
  if (key) {
    showKeySet();
  } else {
    document.getElementById('controls-card').style.display = 'block';
  }
  updateWatchlistSummary();
  lucide.createIcons();
});

function updateWatchlistSummary() {
  const cc = WATCHLIST.competitors.length;
  const pp = WATCHLIST.partners.length;
  const pages = [...WATCHLIST.competitors, ...WATCHLIST.partners, ...WATCHLIST.marketplaces]
    .reduce((n, e) => n + e.pages.length, 0);
  document.getElementById('watchlist-summary').innerHTML =
    `Watching <strong>${cc} competitors</strong> · <strong>${pp} partners</strong> · <strong>${pages} pages</strong> total`;
}

// ── API KEY ───────────────────────────────────────────────────────────────────
function saveKey() {
  const val = document.getElementById('api-key-input').value.trim();
  if (!val.startsWith('sk-ant')) {
    alert('That doesn\'t look like an Anthropic API key. It should start with sk-ant-');
    return;
  }
  localStorage.setItem('er_api_key', val);
  showKeySet();
}

function clearKey() {
  localStorage.removeItem('er_api_key');
  document.getElementById('key-input-row').style.display = 'flex';
  document.getElementById('key-set-row').style.display = 'none';
  document.getElementById('controls-card').style.display = 'none';
  document.getElementById('api-key-input').value = '';
}

function showKeySet() {
  document.getElementById('key-input-row').style.display = 'none';
  document.getElementById('key-set-row').style.display = 'flex';
  document.getElementById('controls-card').style.display = 'block';
}

function getKey() { return localStorage.getItem('er_api_key'); }

// ── LOGGING ───────────────────────────────────────────────────────────────────
function log(msg, type = '') {
  const box = document.getElementById('log-box');
  const line = document.createElement('div');
  line.className = 'log-line' + (type ? ' ' + type : '');
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  line.textContent = `[${ts}] ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function setStage(id, state) {
  ['stage-scout','stage-interpret','stage-rank','stage-activate'].forEach(s => {
    const el = document.getElementById(s);
    el.classList.remove('active','done');
    if (s === id) el.classList.add(state);
    else if (state === 'done' || (
      ['stage-scout','stage-interpret','stage-rank','stage-activate'].indexOf(s) <
      ['stage-scout','stage-interpret','stage-rank','stage-activate'].indexOf(id)
    )) el.classList.add('done');
  });
}

function clearLog() {
  document.getElementById('log-box').innerHTML = '';
}

// ── SCOUT: FETCH PAGES ────────────────────────────────────────────────────────
async function fetchPage(url, name, type) {
  try {
    const proxyUrl = CORS_PROXY + encodeURIComponent(url);
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    ['script','style','nav','footer','header','aside','form','iframe'].forEach(tag =>
      doc.querySelectorAll(tag).forEach(el => el.remove())
    );
    const title = doc.title || '';
    const text = (doc.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3500);
    if (!text || text.length < 100) return null;
    return { url, name, type, title, text };
  } catch (e) {
    log(`  ✗ ${name} — ${url.slice(0, 50)}… (${e.message})`, 'err');
    return null;
  }
}

async function scoutAll(urlList) {
  const BATCH = 5;
  const results = [];
  for (let i = 0; i < urlList.length; i += BATCH) {
    const batch = urlList.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(({ url, name, type }) => fetchPage(url, name, type))
    );
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value);
        log(`  ✓ ${batch[idx].name} — ${batch[idx].url.slice(0,55)}…`, 'ok');
      }
    });
  }
  return results;
}

// ── ANALYZE: CALL CLAUDE ──────────────────────────────────────────────────────
async function analyzePages(pages, apiKey) {
  const pageContext = pages.map(p =>
    `COMPANY: ${p.name} (${p.type})\nSOURCE URL: ${p.url}\nPAGE TITLE: ${p.title}\nCONTENT:\n${p.text}`
  ).join('\n\n---PAGE BREAK---\n\n');

  const userMsg = `Today's date: ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}\n\nHere are the pages to analyze (${pages.length} total):\n\n${pageContext}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
  const raw = data.content?.[0]?.text?.trim() || '';

  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── MAIN PIPELINE ─────────────────────────────────────────────────────────────
async function runPipeline(urlList, label) {
  if (isRunning) return;
  isRunning = true;

  const key = getKey();
  if (!key) { alert('Please save your API key first.'); isRunning = false; return; }

  // Show pipeline panel, hide results
  document.getElementById('pipeline-card').style.display = 'block';
  document.getElementById('results-card').style.display = 'none';
  document.getElementById('export-card').style.display = 'none';
  document.getElementById('run-btn').disabled = true;
  document.getElementById('spot-btn').disabled = true;
  document.getElementById('status-badge').textContent = '⏳ Running…';
  clearLog();
  currentDigest = null;

  try {
    // SCOUT
    setStage('stage-scout', 'active');
    log(`Scout — fetching ${urlList.length} pages…`, 'info');
    const pages = await scoutAll(urlList);
    log(`Scout complete — ${pages.length} pages fetched with content.`, 'ok');
    setStage('stage-scout', 'done');

    if (pages.length === 0) {
      log('No pages returned content. Check your connection or try again.', 'err');
      document.getElementById('status-badge').textContent = '⚠ No Content';
      isRunning = false;
      document.getElementById('run-btn').disabled = false;
      document.getElementById('spot-btn').disabled = false;
      return;
    }

    // INTERPRET + RANK + ACTIVATE (single Claude call)
    setStage('stage-interpret', 'active');
    log(`Interpreter — sending ${pages.length} pages to Claude…`, 'info');

    setStage('stage-rank', 'active');
    log('Ranker — scoring and prioritizing signals…', 'info');

    setStage('stage-activate', 'active');
    log('Activator — generating partner actions…', 'info');

    const result = await analyzePages(pages, key);

    setStage('stage-activate', 'done');
    log(`Pipeline complete — ${result.signals?.length || 0} signals in digest.`, 'ok');

    currentDigest = { ...result, run_label: label, run_date: new Date().toISOString() };
    renderResults(currentDigest);
    document.getElementById('status-badge').textContent = `✓ ${result.signals?.length || 0} signals`;

  } catch (e) {
    log(`Error: ${e.message}`, 'err');
    document.getElementById('status-badge').textContent = '✗ Error';
    const grid = document.getElementById('signals-grid');
    grid.innerHTML = `<div class="error-banner">⚠ ${e.message}<br><small>Check your API key and try again.</small></div>`;
    document.getElementById('results-card').style.display = 'block';
  } finally {
    isRunning = false;
    document.getElementById('run-btn').disabled = false;
    document.getElementById('spot-btn').disabled = false;
  }
}

async function runFullRadar() {
  const urlList = [];
  for (const c of WATCHLIST.competitors)  for (const u of c.pages) urlList.push({ url: u, name: c.name, type: 'competitor' });
  for (const p of WATCHLIST.partners)     for (const u of p.pages) urlList.push({ url: u, name: p.name, type: 'partner' });
  for (const m of WATCHLIST.marketplaces) for (const u of m.pages) urlList.push({ url: u, name: m.name, type: 'marketplace' });
  await runPipeline(urlList, 'Full Radar');
}

async function runSpotCheck() {
  const url = document.getElementById('spot-url').value.trim();
  if (!url || !url.startsWith('http')) { alert('Please enter a valid URL starting with http://'); return; }
  // guess company name from hostname
  const host = new URL(url).hostname.replace('www.','').split('.')[0];
  const name = host.charAt(0).toUpperCase() + host.slice(1);
  await runPipeline([{ url, name, type: 'competitor' }], `Spot Check — ${url}`);
}

// ── PEOPLE SCOUT ──────────────────────────────────────────────────────────────

const PERSONA_GROUPS = [
  {
    label: 'Economic Buyers',
    titles: [
      'Chief Information Security Officer (CISO)',
      'VP of Security / Head of Security',
      'Chief Technology Officer (CTO)',
      'Chief Information Officer (CIO) / Chief Digital Officer'
    ]
  },
  {
    label: 'Technical Buyers',
    titles: [
      'Director of Security Architecture / Head of Security Engineering',
      'SOC Manager / Director of Security Operations',
      'Director of Identity & Access Management',
      'Head of Threat Detection & Response / Incident Response Lead'
    ]
  },
  {
    label: 'AI, Risk & Compliance',
    titles: [
      'Head of AI Security / Director of AI Governance',
      'Head of GRC / Director of Governance, Risk & Compliance',
      'Head of Data & AI Platform / Head of Digital Transformation',
      'Chief Financial Officer (if they own Ethics & Compliance / Risk Management)'
    ]
  }
];

const PEOPLE_SYSTEM_PROMPT = `You are an enterprise sales intelligence assistant for Obsidian Security.

OBSIDIAN CONTEXT:
- Obsidian Security: SaaS security platform — runtime identity misuse detection, AI Agent Governance, SaaS ITDR, Access & Privilege Control, SaaS Supply Chain Resilience, FSI Compliance (GLBA/NYDFS/DORA)
- Primary buyer personas: CISO, VP Security, CTO/CIO, Director Security Architecture, SOC Manager, Director IAM, Head of AI Security, Head of GRC, Head of Digital Transformation

You will be given a company name and a list of buyer persona titles to research. Using your knowledge, identify the real people currently (or most recently) in those roles at that company.

Return ONLY a valid JSON array (no markdown fences) with this structure:
[
  {
    "name": "<Full Name or null if not found>",
    "title": "<Their actual title at the company>",
    "persona_category": "economic_buyer|technical_buyer|risk_compliance|ai_data",
    "persona_label": "<e.g. CISO, SOC Manager, Director IAM>",
    "linkedin_slug": "<expected LinkedIn profile slug, e.g. john-doe-123 — your best guess based on their name, or null>",
    "context": "<2-3 sentences: tenure, background, focus areas, notable context>",
    "obsidian_angle": "<1 sentence: why this person is relevant to Obsidian — which pillar, which pain they feel>",
    "confidence": "high|medium|low"
  }
]

Rules:
- Only include people you have reasonable confidence about. Set confidence accordingly.
- If you cannot find anyone for a title, omit it — do not return placeholder rows.
- Do not fabricate people. If unsure, set confidence to "low" and note uncertainty in context.
- Prefer current employees over former. If someone recently left, note it in context.
- Return [] if you truly cannot find anyone.`;

async function callPeopleHaiku(companyName, group, pageContext, apiKey) {
  const userMsg = `Company: ${companyName}

${pageContext ? `Company leadership page content:\n${pageContext}\n\n` : ''}Research the following buyer persona titles at ${companyName} and identify the real people in those roles:

${group.titles.map((t, i) => `${i+1}. ${t}`).join('\n')}

Return a JSON array of people found. Only include people you have reasonable confidence about.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: PEOPLE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
  const raw = data.content?.[0]?.text?.trim() || '[]';
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

const STACK_SYSTEM_PROMPT = `You are an enterprise sales intelligence assistant for Obsidian Security.

OBSIDIAN CONTEXT:
- Obsidian Security: SaaS security platform — runtime identity misuse detection, AI Agent Governance, SaaS ITDR, Access & Privilege Control, SaaS Supply Chain Resilience, FSI Compliance (GLBA/NYDFS/DORA)
- Key competitors: AppOmni (SSPM), CrowdStrike Falcon Shield, Netskope, Zscaler, Okta, Microsoft Defender for Cloud Apps, Grip Security, Reco.AI, Valence Security
- Key VAR partners: Optiv, GuidePoint Security, Presidio, WWT, EverSec, Myriad360, SHI, CDW, Trace3

Using your knowledge, research the target company's:
1. Security vendor stack (SIEM, EDR, CASB, IAM, SaaS security, cloud security tools they likely use)
2. Which of Obsidian's VAR partners appear to have a relationship with this company
3. Which competitors are deployed or mentioned publicly at this company

Return ONLY a valid JSON object (no markdown fences):
{
  "stack": [
    {
      "vendor": "<vendor name>",
      "category": "<SIEM|EDR|IAM|CASB|SaaS Security|Cloud Security|ITSM|Data Privacy|Compliance|Other>",
      "confidence": "high|medium|low|not_detected",
      "notes": "<1-2 sentences: what was found, why it matters for Obsidian positioning>",
      "obsidian_relationship": "complement|competitor|neutral|greenfield"
    }
  ],
  "partner_presence": [
    {
      "partner": "<VAR/MSSP name>",
      "relationship": "<reseller|co-sell|managed-services|joint-customer|event|none-found>",
      "confidence": "high|medium|low",
      "notes": "<1 sentence>"
    }
  ],
  "competitive_presence": [
    {
      "competitor": "<competitor name>",
      "status": "confirmed|likely|not_detected",
      "confidence": "high|medium|low",
      "notes": "<1 sentence on what was found or not found>"
    }
  ],
  "overall_competitive_posture": "<2-3 sentences: is this greenfield for SaaS security? What's the incumbent? What's the recommended Obsidian angle?>",
  "recommended_frame": "<1 sentence: how to position Obsidian given what's in the stack>"
}

Rules:
- Be honest about confidence. "not_detected" is a valid and useful finding.
- Focus on security-relevant vendors, not generic SaaS tools.
- A greenfield finding (no SSPM/SaaS security tool detected) is as valuable as a confirmed competitor.`;

async function callStackHaiku(companyName, pageContext, apiKey) {
  const userMsg = `Research the security vendor stack, VAR partner presence, and competitor footprint for: ${companyName}

${pageContext ? `Company page context:\n${pageContext}\n\n` : ''}Based on your knowledge of this company, return the structured JSON with their security stack, which of Obsidian's VAR partners (Optiv, GuidePoint Security, Presidio, WWT, EverSec, Myriad360, SHI, CDW, Trace3) have relationships here, and which Obsidian competitors (AppOmni, CrowdStrike, Palo Alto, Wiz, Netskope, Zscaler, Microsoft Defender, Okta) are present.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: STACK_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }

  const data = await resp.json();
  const raw = data.content?.[0]?.text?.trim() || '{}';
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function runPeopleScout() {
  const companyName = document.getElementById('people-company').value.trim();
  const leadershipUrl = document.getElementById('people-url').value.trim();
  if (!companyName) { alert('Please enter a company name.'); return; }

  const key = getKey();
  if (!key) { alert('Please save your API key first.'); return; }

  const btn = document.getElementById('people-btn');
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:5px;"></span>Scouting…';

  const card = document.getElementById('people-card');
  const grid = document.getElementById('people-grid');
  const statusEl = document.getElementById('people-status');
  const labelEl = document.getElementById('people-company-label');

  card.style.display = 'block';
  labelEl.textContent = `— ${companyName}`;
  statusEl.style.display = 'block';
  statusEl.textContent = '⏳ Fetching leadership page…';
  grid.innerHTML = '<div class="people-loading"><div class="people-spinner"></div>Running 3 parallel haiku agents — researching economic buyers, technical buyers, and AI/risk personas…</div>';

  // Try to fetch leadership page for extra context
  let pageContext = '';
  if (leadershipUrl && leadershipUrl.startsWith('http')) {
    try {
      const proxyUrl = CORS_PROXY + encodeURIComponent(leadershipUrl);
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        ['script','style','nav','footer','header','aside'].forEach(t => doc.querySelectorAll(t).forEach(e => e.remove()));
        pageContext = (doc.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
      }
    } catch {
      // silently ignore — model knowledge is fallback
    }
  }

  statusEl.textContent = `⏳ Running 3 parallel haiku agents for ${companyName}…`;

  try {
    // 4 parallel haiku calls — 3 persona groups + 1 stack/competitive intel
    statusEl.textContent = `⏳ Running 4 parallel haiku agents — 3 persona groups + stack & competitive intel…`;
    const [group1, group2, group3, stackData] = await Promise.all([
      ...PERSONA_GROUPS.map(g => callPeopleHaiku(companyName, g, pageContext, key)),
      callStackHaiku(companyName, pageContext, key)
    ]);

    const allPeople = [...(group1||[]), ...(group2||[]), ...(group3||[])];

    if (allPeople.length === 0) {
      grid.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px 0;">No people found with sufficient confidence. Try adding a leadership page URL for better results.</div>';
    } else {
      renderPeople(allPeople, companyName);
    }

    if (stackData) {
      renderStackIntel(stackData, companyName);
    }

    statusEl.textContent = `✓ ${allPeople.length} people · ${(stackData?.stack||[]).length} stack entries · ${(stackData?.competitive_presence||[]).length} competitive signals`;

  } catch (e) {
    grid.innerHTML = `<div class="error-banner">⚠ ${escHtml(e.message)}</div>`;
    statusEl.textContent = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="user-search" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"></i>Scout People';
    lucide.createIcons();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderPeople(people, companyName) {
  const grid = document.getElementById('people-grid');
  grid.innerHTML = '';

  const personaClass = {
    economic_buyer:   'pb-econ',
    technical_buyer:  'pb-tech',
    risk_compliance:  'pb-risk',
    ai_data:          'pb-ai',
    it_platform:      'pb-it'
  };
  const personaLabel = {
    economic_buyer:   'Economic Buyer',
    technical_buyer:  'Technical Buyer',
    risk_compliance:  'Risk & Compliance',
    ai_data:          'AI & Data',
    it_platform:      'IT / Platform'
  };
  const confidenceColor = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--muted)' };

  // Sort: economic buyers first, then by confidence
  const order = ['economic_buyer','technical_buyer','risk_compliance','ai_data','it_platform'];
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  people.sort((a, b) => {
    const oa = order.indexOf(a.persona_category);
    const ob = order.indexOf(b.persona_category);
    if (oa !== ob) return oa - ob;
    return (confidenceRank[a.confidence] || 1) - (confidenceRank[b.confidence] || 1);
  });

  people.forEach(p => {
    const isPrimary = p.persona_category === 'economic_buyer' && p.confidence === 'high';
    const liUrl = p.linkedin_slug
      ? `https://www.linkedin.com/in/${p.linkedin_slug}/`
      : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((p.name||'') + ' ' + companyName)}`;
    const liLabel = p.linkedin_slug ? '↗ LinkedIn' : '↗ Search';

    const card = document.createElement('div');
    card.className = `person-card${isPrimary ? ' primary-contact' : ''}`;
    card.innerHTML = `
      <div class="person-top">
        <div>
          <div class="person-name">${escHtml(p.name || 'Name not confirmed')}</div>
          <div class="person-title">${escHtml(p.title || p.persona_label || '')}</div>
        </div>
        <a href="${escHtml(liUrl)}" target="_blank" class="person-linkedin">${liLabel}</a>
      </div>
      ${p.context ? `<div class="person-context">${escHtml(p.context)}</div>` : ''}
      ${p.obsidian_angle ? `<div class="person-angle">${escHtml(p.obsidian_angle)}</div>` : ''}
      <div class="person-badges">
        <span class="persona-badge ${personaClass[p.persona_category] || 'pb-econ'}">${personaLabel[p.persona_category] || p.persona_category}</span>
        <span class="persona-badge" style="background:var(--bg);color:${confidenceColor[p.confidence]};border:1px solid ${confidenceColor[p.confidence]};">
          ${p.confidence === 'high' ? '● ' : p.confidence === 'medium' ? '◐ ' : '○ '}${(p.confidence||'').charAt(0).toUpperCase() + (p.confidence||'').slice(1)} confidence
        </span>
      </div>`;
    grid.appendChild(card);
  });

  lucide.createIcons();
}

function renderStackIntel(data, companyName) {
  // Inject a stack section after the people grid inside people-card
  const card = document.getElementById('people-card');
  const existingStack = document.getElementById('stack-intel-section');
  if (existingStack) existingStack.remove();

  const section = document.createElement('div');
  section.id = 'stack-intel-section';
  section.style.cssText = 'margin-top:20px; padding-top:16px; border-top:1px solid var(--border);';

  const confIcon = { high: '●', medium: '◐', low: '○', not_detected: '○', confirmed: '●', likely: '◐', none_found: '○' };
  const confColor = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--muted)', not_detected: 'var(--muted)', confirmed: 'var(--green)', likely: 'var(--amber)', none_found: 'var(--muted)' };
  const relColor  = { complement: '#d1fae5', competitor: '#fee2e2', neutral: '#f3f4f6', greenfield: '#ecfdf5' };
  const relText   = { complement: '#065f46', competitor: '#991b1b', neutral: '#374151', greenfield: '#059669' };

  const stackRows = (data.stack || []).map(s => `
    <tr>
      <td style="font-weight:600;color:var(--navy);">${escHtml(s.vendor)}</td>
      <td style="color:var(--muted);font-size:11px;">${escHtml(s.category)}</td>
      <td style="font-size:11px;font-weight:700;color:${confColor[s.confidence]||'var(--muted)'};">${confIcon[s.confidence]||'○'} ${escHtml(s.confidence||'')}</td>
      <td style="font-size:11px;color:var(--text);">${escHtml(s.notes||'')}</td>
      <td><span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${relColor[s.obsidian_relationship]||'#f3f4f6'};color:${relText[s.obsidian_relationship]||'#374151'};">${escHtml(s.obsidian_relationship||'')}</span></td>
    </tr>`).join('');

  const partnerRows = (data.partner_presence || []).map(p => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:12px;color:${p.relationship === 'none-found' ? 'var(--muted)' : 'var(--green)'};flex-shrink:0;">${p.relationship === 'none-found' ? '—' : '✓'}</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--navy);">${escHtml(p.partner)}</div>
        <div style="font-size:11px;color:var(--muted);">${escHtml(p.relationship)} · ${escHtml(p.confidence)} confidence</div>
        ${p.notes ? `<div style="font-size:11px;color:var(--text);margin-top:2px;">${escHtml(p.notes)}</div>` : ''}
      </div>
    </div>`).join('');

  const competitorRows = (data.competitive_presence || []).map(c => {
    const icon = c.status === 'confirmed' ? '🔴' : c.status === 'likely' ? '🟡' : '🟢';
    return `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;flex-shrink:0;">${icon}</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--navy);">${escHtml(c.competitor)}</div>
        <div style="font-size:11px;color:var(--muted);">${escHtml(c.status)} · ${escHtml(c.confidence)} confidence</div>
        ${c.notes ? `<div style="font-size:11px;color:var(--text);margin-top:2px;">${escHtml(c.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  section.innerHTML = `
    <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--accent);margin-bottom:14px;">Stack &amp; Competitive Intel — ${escHtml(companyName)}</div>

    ${data.overall_competitive_posture ? `
    <div style="background:rgba(4,49,182,0.05);border:1px solid rgba(4,49,182,0.15);border-radius:6px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--text);line-height:1.55;">
      <strong style="color:var(--navy);">Competitive Posture:</strong> ${escHtml(data.overall_competitive_posture)}
      ${data.recommended_frame ? `<div style="margin-top:6px;color:var(--accent);font-weight:600;">→ ${escHtml(data.recommended_frame)}</div>` : ''}
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;">Security Vendor Stack</div>
        ${stackRows ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:var(--navy);">
            <th style="padding:6px 10px;color:#fff;font-size:10px;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Vendor</th>
            <th style="padding:6px 10px;color:#fff;font-size:10px;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Category</th>
            <th style="padding:6px 10px;color:#fff;font-size:10px;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Confidence</th>
            <th style="padding:6px 10px;color:#fff;font-size:10px;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Notes</th>
            <th style="padding:6px 10px;color:#fff;font-size:10px;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">vs Obsidian</th>
          </tr></thead>
          <tbody>${stackRows}</tbody>
        </table>` : '<div style="color:var(--muted);font-size:12px;">No stack data found.</div>'}
      </div>

      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;">VAR Partner Presence</div>
        <div style="margin-bottom:14px;">${partnerRows || '<div style="font-size:12px;color:var(--muted);">No partner relationships detected.</div>'}</div>

        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);margin-bottom:8px;margin-top:14px;">Competitor Presence</div>
        <div>${competitorRows || '<div style="font-size:12px;color:var(--muted);">No competitive presence detected.</div>'}</div>
      </div>

    </div>`;

  card.appendChild(section);
  lucide.createIcons();
}

// ── RENDER RESULTS ────────────────────────────────────────────────────────────
function signalTypeLabel(t) {
  return {
    competitor_move: 'Competitor Move', partner_announcement: 'Partner Announcement',
    tech_integration: 'Tech Integration', marketplace_listing: 'Marketplace Listing',
    joint_customer_story: 'Customer Story', webinar_event: 'Event / Webinar',
    mssp_motion: 'MSSP Motion', category_trend: 'Market Trend',
    market_trend: 'Market Trend', partner_move: 'Partner Move',
    product_launch: 'Product Launch', buying_signal: 'Buying Signal',
    executive_signal: 'Executive Signal', sales_enablement: 'Sales Enablement',
    account_activation: 'Account Activation'
  }[t] || t;
}

function priorityIcon(p) {
  const icons = {
    high:   `<i data-lucide="alert-circle" style="width:14px;height:14px;color:var(--red);vertical-align:middle;margin-right:4px;flex-shrink:0;"></i>`,
    medium: `<i data-lucide="alert-triangle" style="width:14px;height:14px;color:var(--amber);vertical-align:middle;margin-right:4px;flex-shrink:0;"></i>`,
    low:    `<i data-lucide="circle" style="width:14px;height:14px;color:var(--muted);vertical-align:middle;margin-right:4px;flex-shrink:0;"></i>`
  };
  return icons[p] || icons.low;
}

function renderResults(digest) {
  // Summary
  const summary = document.getElementById('digest-summary');
  const date = new Date(digest.run_date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  summary.innerHTML = `
    <strong>${date}</strong> · ${digest.digest_summary || ''}
    <div class="coverage-row">
      <div class="cov-item"><span>${digest.pages_scanned || 0}</span> pages scanned</div>
      <div class="cov-item"><span>${digest.signals_found || 0}</span> signals found</div>
      <div class="cov-item"><span>${(digest.signals||[]).filter(s=>s.priority==='high').length}</span> high priority</div>
      <div class="cov-item"><span>${(digest.signals||[]).filter(s=>s.priority==='medium').length}</span> medium priority</div>
    </div>`;

  // Signal cards
  const grid = document.getElementById('signals-grid');
  grid.innerHTML = '';

  const signals = (digest.signals || []).sort((a,b) => {
    const da = a.signal_date ? new Date(a.signal_date) : null;
    const db = b.signal_date ? new Date(b.signal_date) : null;
    if (da && db) return db - da;
    if (da) return -1;
    if (db) return 1;
    return (b.priority_score||0) - (a.priority_score||0);
  });

  if (signals.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="icon"><i data-lucide="radar" style="width:32px;height:32px;color:var(--muted);"></i></div>No signals found in this scan. Try again later or spot-check a specific URL.</div>`;
  } else {
    signals.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = `signal-card priority-${s.priority}${s.target_account ? ' target-account' : ''}`;
      card.innerHTML = `
        ${s.target_account ? `<div class="target-account-badge"><i data-lucide="building-2" style="width:10px;height:10px;"></i>Target Account — ${escHtml(s.target_account)}</div>` : ''}
        <div class="signal-header">
          <div class="signal-title">${priorityIcon(s.priority)}${i+1}. ${escHtml(s.title)}</div>
          <div class="signal-header-right">
            <button class="export-slide-btn" onclick="exportSlide(${i})"><i data-lucide="presentation" style="width:11px;height:11px;"></i> Slide</button>
            <span class="priority-badge priority-${s.priority}">${(s.priority||'').toUpperCase()}</span>
          </div>
        </div>
        <div class="signal-tags">
          <span class="tag">${signalTypeLabel(s.signal_type)}</span>
          <span class="tag tag-company">${escHtml(s.company)}</span>
          ${s.signal_date ? `<span class="tag" style="color:var(--muted);display:inline-flex;align-items:center;gap:3px;"><i data-lucide="calendar" style="width:11px;height:11px;"></i>${escHtml(s.signal_date)}</span>` : ''}
          ${s.affected_segment ? `<span class="tag tag-segment">${escHtml(s.affected_segment)}</span>` : ''}
          ${s.related_partner ? `<span class="tag">${escHtml(s.related_partner)}</span>` : ''}
        </div>
        <div class="signal-rows">
          <div class="signal-row"><span class="lbl">Summary</span><span class="val">${escHtml(s.summary)}</span></div>
          <div class="signal-row"><span class="lbl">Why it matters</span><span class="val">${escHtml(s.why_it_matters)}</span></div>
          <div class="signal-row"><span class="lbl">Source</span><span class="val"><a href="${escHtml(s.source_url)}" target="_blank">${escHtml(s.source_url)}</a></span></div>
        </div>
        ${s.action_description ? `
        <div class="action-box">
          <div class="action-label"><i data-lucide="check-circle" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>Recommended Action</div>
          <div class="action-desc">${escHtml(s.action_description)}</div>
          <div class="action-meta">
            <div>Owner: <strong>${escHtml(s.suggested_owner||'')}</strong></div>
            ${s.suggested_partners?.length ? `<div>Activate: <strong>${s.suggested_partners.map(escHtml).join(', ')}</strong></div>` : ''}
            ${s.suggested_accounts?.length ? `<div>Target: <strong>${s.suggested_accounts.map(escHtml).join(', ')}</strong></div>` : ''}
          </div>
          ${s.outreach_draft ? `
          <div class="outreach-draft">
            <div class="outreach-header">
              <span class="outreach-label"><i data-lucide="mail" style="width:11px;height:11px;"></i>Partner outreach draft</span>
              <button class="copy-btn" onclick="copyOutreach(this, \`${s.outreach_draft.replace(/`/g,"'")}\`)">
                <i data-lucide="copy" style="width:12px;height:12px;"></i>Copy
              </button>
            </div>
            <div class="outreach-text">${escHtml(s.outreach_draft)}</div>
          </div>` : ''}
        </div>` : ''}`;
      grid.appendChild(card);
    });
  }

  window._digestSignals = signals;  // store for per-signal export

  document.getElementById('results-card').style.display = 'block';
  document.getElementById('export-card').style.display = 'block';
  const dateStr = new Date(digest.run_date).toISOString().slice(0,10);
  document.getElementById('export-note').textContent = `Digest from ${dateStr} · ${signals.length} signals`;
  buildFilters(signals);
  document.getElementById('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  lucide.createIcons();
}

// ── SINGLE-SIGNAL PPTX EXPORT ─────────────────────────────────────────────────

function exportSlide(idx) {
  const s = (window._digestSignals || [])[idx];
  if (!s) return;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';  // 13.33" x 7.5"

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  // ── Left accent bar ──────────────────────────────────────────────────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.07, h: 7.5,
    fill: { color: '0431B6' }, line: { type: 'none' }
  });

  // ── Priority badge (mid-right, rounded) — sits left of logo ─────────────────
  const pColors = { high: 'FF9D03', medium: '5565E2', low: '898989' };
  const pColor  = pColors[s.priority] || '5565E2';
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 9.9, y: 0.1, w: 1.3, h: 0.36,
    fill: { color: pColor }, line: { type: 'none' }, rectRadius: 0.08
  });
  slide.addText((s.priority || '').toUpperCase(), {
    x: 9.9, y: 0.1, w: 1.3, h: 0.36,
    color: 'FFFFFF', fontSize: 9, bold: true, fontFace: 'Inter',
    align: 'center', valign: 'middle', charSpacing: 1.5
  });

  // ── Obsidian logo (top-right) — black variant on white bg ────────────────────
  slide.addImage({ path: 'images/Obsidian Logo - Black@2x.png', x: 11.45, y: 0.07, w: 1.75, h: 0.44 });

  // ── Company + signal type (left-aligned) ─────────────────────────────────────
  const typeLabels = {
    competitor_move: 'Competitor Move', partner_announcement: 'Partner Announcement',
    tech_integration: 'Tech Integration', marketplace_listing: 'Marketplace Listing',
    joint_customer_story: 'Joint Customer Story', webinar_event: 'Webinar / Event',
    mssp_motion: 'MSSP Motion', category_trend: 'Category Trend', unknown: 'Signal'
  };
  const typeLabel = typeLabels[s.signal_type] || 'Signal';
  slide.addText(`${(s.company || '').toUpperCase()}  ·  ${typeLabel}`, {
    x: 0.25, y: 0.15, w: 9.3, h: 0.32,
    color: '002594', fontSize: 10, bold: true, fontFace: 'Inter', charSpacing: 0.5
  });

  // ── Signal title ──────────────────────────────────────────────────────────────
  slide.addText(s.title || '', {
    x: 0.25, y: 0.58, w: 12.5, h: 1.05,
    color: '0B173B', fontSize: 24, bold: true, fontFace: 'Inter',
    wrap: true, lineSpacingMultiple: 1.1
  });

  // ── Main divider ─────────────────────────────────────────────────────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.25, y: 1.72, w: 12.5, h: 0.025,
    fill: { color: '002594' }, line: { type: 'none' }
  });

  // ── What Happened ─────────────────────────────────────────────────────────────
  slide.addText('WHAT HAPPENED', {
    x: 0.25, y: 1.82, w: 5, h: 0.26,
    color: '5565E2', fontSize: 7.5, bold: true, fontFace: 'Inter', charSpacing: 2
  });
  slide.addText(s.summary || '', {
    x: 0.25, y: 2.1, w: 12.5, h: 0.88,
    color: '131313', fontSize: 11.5, fontFace: 'Inter', wrap: true, lineSpacingMultiple: 1.3
  });

  // ── Thin section separator ────────────────────────────────────────────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.25, y: 3.04, w: 12.5, h: 0.015,
    fill: { color: 'D5DCF5' }, line: { type: 'none' }
  });

  // ── Why It Matters ────────────────────────────────────────────────────────────
  slide.addText('WHY IT MATTERS', {
    x: 0.25, y: 3.12, w: 5, h: 0.26,
    color: '5565E2', fontSize: 7.5, bold: true, fontFace: 'Inter', charSpacing: 2
  });
  slide.addText(s.why_it_matters || '', {
    x: 0.25, y: 3.4, w: 12.5, h: 0.78,
    color: '131313', fontSize: 11.5, fontFace: 'Inter', wrap: true, lineSpacingMultiple: 1.3
  });

  // ── Bottom callout zone — semi-transparent navy wash, full-bleed ──────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 4.2, w: 13.33, h: 3.3,
    fill: { color: '0B173B', transparency: 78 }, line: { type: 'none' }
  });
  // Solid top border anchoring the callout
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 4.2, w: 13.33, h: 0.04,
    fill: { color: '0431B6' }, line: { type: 'none' }
  });

  if (s.action_description) {
    // "Recommended Action" label
    slide.addText('RECOMMENDED ACTION', {
      x: 0.45, y: 4.32, w: 5, h: 0.26,
      color: '5565E2', fontSize: 7.5, bold: true, fontFace: 'Inter', charSpacing: 2
    });

    // Action type chip (rounded)
    const actionLabel = (s.action_type || 'internal_brief').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 6.8, y: 4.3, w: 2.9, h: 0.3,
      fill: { color: '0431B6' }, line: { type: 'none' }, rectRadius: 0.08
    });
    slide.addText(actionLabel, {
      x: 6.8, y: 4.3, w: 2.9, h: 0.3,
      color: 'FFFFFF', fontSize: 7.5, bold: true, fontFace: 'Inter',
      align: 'center', valign: 'middle', charSpacing: 1
    });

    // Action description
    slide.addText(s.action_description, {
      x: 0.45, y: 4.68, w: 12.4, h: 0.75,
      color: '0B173B', fontSize: 11.5, bold: true, fontFace: 'Inter',
      wrap: true, lineSpacingMultiple: 1.25
    });

    // Owner + partners
    let ownerLine = `Owner: ${s.suggested_owner || 'Partner Manager'}`;
    if (s.suggested_partners && s.suggested_partners.length) ownerLine += `   ·   Activate: ${s.suggested_partners.join(', ')}`;
    slide.addText(ownerLine, {
      x: 0.45, y: 5.48, w: 12.4, h: 0.32,
      color: '002594', fontSize: 9.5, bold: true, fontFace: 'Inter'
    });

    // Outreach draft
    if (s.outreach_draft) {
      slide.addText(`"${s.outreach_draft}"`, {
        x: 0.45, y: 5.85, w: 12.4, h: 0.95,
        color: '4E4E4E', fontSize: 9.5, fontFace: 'Inter',
        wrap: true, italic: true, lineSpacingMultiple: 1.25
      });
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  if (s.priority_rationale) {
    slide.addText(s.priority_rationale, {
      x: 0.25, y: 7.1, w: 10.5, h: 0.22,
      color: '898989', fontSize: 7.5, fontFace: 'Inter'
    });
  }
  if (s.source_url) {
    slide.addText(s.source_url, {
      x: 0.25, y: 7.3, w: 12.5, h: 0.18,
      color: '898989', fontSize: 7, fontFace: 'Inter'
    });
  }

  const safeName = (s.title || 'signal').slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  pptx.writeFile({ fileName: `signal-${safeName}.pptx` });
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
let activeFilters = { pillar: 'all', company: 'all' };

const PILLAR_META = {
  'SSPM':              { label: 'SSPM',             icon: 'shield-check', color: '#2563eb' },
  'Agentic AI':        { label: 'Agentic AI',       icon: 'bot',          color: '#7c3aed' },
  'SaaS Supply Chain': { label: 'SaaS Supply Chain',icon: 'link-2',       color: '#0d9488' },
};

function buildFilters(signals) {
  const pillars   = [...new Set(signals.map(s => s.pillar).filter(Boolean))];
  const companies = [...new Set(signals.map(s => s.company).filter(Boolean))];

  const pillarEl   = document.getElementById('filter-pillars');
  const companyEl  = document.getElementById('filter-companies');
  activeFilters    = { pillar: 'all', company: 'all' };

  pillarEl.innerHTML  = '';
  companyEl.innerHTML = '';

  // All chip
  pillarEl.appendChild(makeChip('All', 'all', 'pillar', true));
  pillars.forEach(p => pillarEl.appendChild(makeChip(p, p, 'pillar', false)));

  const hasAccountSignals = signals.some(s => s.target_account);
  companyEl.appendChild(makeChip('All', 'all', 'company', true));
  if (hasAccountSignals) companyEl.appendChild(makeChip('Target Accounts', '__accounts__', 'company', false));
  companies.filter(c => !signals.find(s => s.company === c && s.target_account))
    .forEach(c => companyEl.appendChild(makeChip(c, c, 'company', false)));

  updateFilterCount(signals);
  lucide.createIcons();
}

function makeChip(label, value, group, isActive) {
  const btn = document.createElement('button');
  btn.className = 'chip' + (isActive ? ' active' : '');
  btn.dataset.value = value;
  btn.dataset.group = group;

  const meta = PILLAR_META[value];
  if (meta) {
    btn.innerHTML = `<i data-lucide="${meta.icon}" style="width:11px;height:11px;"></i>${escHtml(label)}`;
    if (isActive) btn.style.background = meta.color;
  } else {
    btn.textContent = label;
  }

  btn.onclick = () => {
    const isAlreadyActive = activeFilters[group] === value && value !== 'all';
    document.querySelectorAll(`.chip[data-group="${group}"]`).forEach(c => {
      c.classList.remove('active');
      c.style.background = '';
    });
    if (isAlreadyActive) {
      activeFilters[group] = 'all';
      document.querySelector(`.chip[data-group="${group}"][data-value="all"]`).classList.add('active');
    } else {
      activeFilters[group] = value;
      btn.classList.add('active');
      const m = PILLAR_META[value];
      if (m) btn.style.background = m.color;
    }
    applyFilters();
    lucide.createIcons();
  };
  return btn;
}

function applyFilters() {
  const cards = document.querySelectorAll('#signals-grid .signal-card');
  const signals = currentDigest ? currentDigest.signals || [] : [];
  let visible = 0;

  cards.forEach((card, i) => {
    const s = signals[i];
    if (!s) return;
    const pillarMatch  = activeFilters.pillar  === 'all' || s.pillar  === activeFilters.pillar;
    const companyMatch = activeFilters.company === 'all'
      || (activeFilters.company === '__accounts__' ? !!s.target_account : s.company === activeFilters.company);
    const show = pillarMatch && companyMatch;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  updateFilterCount(signals, visible);
}

function updateFilterCount(signals, visible) {
  const el = document.getElementById('filter-count');
  if (!el) return;
  const total = signals.length;
  const shown = visible !== undefined ? visible : total;
  el.textContent = shown === total ? `${total} signals` : `${shown} of ${total} signals`;
}

function copyOutreach(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;"></i>Copied`;
    lucide.createIcons();
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<i data-lucide="copy" style="width:12px;height:12px;"></i>Copy`;
      lucide.createIcons();
    }, 2000);
  });
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function downloadMarkdown() {
  if (!currentDigest) return;
  const d = currentDigest;
  const date = new Date(d.run_date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const dateSlug = new Date(d.run_date).toISOString().slice(0,10);
  let md = `# Ecosystem Radar — Daily Digest\n**${date}**\n\n> ${d.digest_summary || ''}\n\n`;
  md += `**Coverage:** ${d.pages_scanned} pages scanned · ${d.signals_found} signals found\n\n---\n\n`;
  const priorityLabel = p => ({ high: '[HIGH]', medium: '[MEDIUM]', low: '[LOW]' }[p] || '[LOW]');
  (d.signals||[]).sort((a,b)=>{const da=a.signal_date?new Date(a.signal_date):null,db=b.signal_date?new Date(b.signal_date):null;if(da&&db)return db-da;if(da)return -1;if(db)return 1;return(b.priority_score||0)-(a.priority_score||0);}).forEach((s,i) => {
    md += `## ${priorityLabel(s.priority)} ${i+1}. ${s.title}\n`;
    md += `\`${signalTypeLabel(s.signal_type)}\` · **${s.company}** · ${(s.priority||'').toUpperCase()} priority\n\n`;
    md += `**Summary:** ${s.summary}\n\n`;
    md += `**Why it matters:** ${s.why_it_matters}\n\n`;
    if (s.affected_segment) md += `**Affected segment:** ${s.affected_segment}\n`;
    if (s.related_partner)  md += `**Related partner:** ${s.related_partner}\n`;
    md += `**Source:** ${s.source_url}\n\n`;
    if (s.action_description) {
      md += `### Recommended Action\n**${s.action_description}**\n`;
      if (s.suggested_owner)            md += `- Owner: ${s.suggested_owner}\n`;
      if (s.suggested_partners?.length) md += `- Activate: ${s.suggested_partners.join(', ')}\n`;
      if (s.suggested_accounts?.length) md += `- Target accounts: ${s.suggested_accounts.join(', ')}\n`;
      if (s.outreach_draft) md += `\n**Partner outreach draft:**\n> ${s.outreach_draft}\n`;
    }
    md += '\n---\n\n';
  });
  md += `*Ecosystem Radar · Obsidian Security Partnerships · ${date}*\n`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ecosystem-radar-${dateSlug}.md`;
  a.click();
}

function copySlack() {
  if (!currentDigest) return;
  const d = currentDigest;
  const date = new Date(d.run_date).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const highs = (d.signals||[]).filter(s=>s.priority==='high');
  const meds  = (d.signals||[]).filter(s=>s.priority==='medium');
  let msg = `*Ecosystem Radar — ${date}*\n${d.digest_summary}\n\n`;
  if (highs.length) {
    msg += `*🔴 High Priority (${highs.length})*\n`;
    highs.forEach(s => msg += `• *${s.title}* — ${s.why_it_matters}\n`);
    msg += '\n';
  }
  if (meds.length) {
    msg += `*🟡 Medium Priority (${meds.length})*\n`;
    meds.forEach(s => msg += `• *${s.title}*\n`);
  }
  navigator.clipboard.writeText(msg).then(() => {
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

// ── DEMO MODE ─────────────────────────────────────────────────────────────────
function loadDemoData() {
  fetch('./data/sample_outputs/demo-digest.json')
    .then(r => r.json())
    .then(raw => {
      const digest = transformDigest(raw);
      document.getElementById('pipeline-card').style.display = 'none';
      document.getElementById('status-badge').textContent = '● Demo Mode';
      currentDigest = digest;
      renderResults(digest);
    })
    .catch(() => {
      alert('Could not load demo-digest.json.\n\nServe the folder with:\n  python3 -m http.server 8080\n\nThen open http://localhost:8080/radar-ui.html');
    });
}

// Transform pipeline JSON schema → UI rendering schema
function transformDigest(raw) {
  const signals = (raw.top_entries || []).map(entry => {
    const s = entry.signal;
    const a = (entry.actions || [])[0] || {};
    return {
      title:             s.title,
      company:           s.company_name,
      company_type:      s.company_type,
      signal_type:       s.signal_type,
      pillar:            s.pillar || null,
      signal_date:       s.publish_date || null,
      target_account:    s.target_account || null,
      summary:           s.summary,
      why_it_matters:    s.why_it_matters,
      related_partner:   s.related_partner,
      affected_segment:  s.affected_segment,
      source_url:        s.source_url,
      priority:          s.priority,
      priority_score:    s.priority_score,
      priority_rationale: s.priority_rationale,
      action_type:       a.action_type,
      action_description: a.description,
      suggested_owner:   a.suggested_owner,
      suggested_partners: a.suggested_partners || [],
      suggested_accounts: a.suggested_accounts || [],
      outreach_draft:    a.outreach_draft
    };
  });
  return {
    run_date:       raw.generated_at,
    run_label:      raw.run_label || 'Saved Digest',
    digest_summary: raw.summary_narrative,
    pages_scanned:  raw.total_pages_scanned,
    signals_found:  raw.total_signals_found,
    signals
  };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── GENERATE BRIEF ────────────────────────────────────────────────────────────

// Demo hotlinks — company name fragments map to pre-built brief paths
const BRIEF_DEMOS = {
  'sutherland': 'data/briefs/sutherland-global-scout-brief.html',
};

async function generateBrief() {
  const input = document.getElementById('brief-company');
  const btn   = document.getElementById('brief-btn');
  const company = (input.value || '').trim();
  if (!company) { input.focus(); return; }

  // Check for demo hotlink first
  const key = Object.keys(BRIEF_DEMOS).find(k => company.toLowerCase().includes(k));
  if (key) {
    window.open(BRIEF_DEMOS[key], '_blank');
    return;
  }

  // Live generation — requires API key
  const apiKey = localStorage.getItem('radar_api_key');
  if (!apiKey) {
    alert('Add your Anthropic API key first (API Configuration above).');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Researching…';

  try {
    const html = await _buildBriefHtml(apiKey, company);
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (e) {
    alert('Brief generation failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="file-text" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"></i>Generate Brief';
    lucide.createIcons();
  }
}

async function _callHaikuBrief(apiKey, system, userMsg) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  const data = await resp.json();
  const raw  = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); } catch { return {}; }
}

async function _buildBriefHtml(apiKey, company) {
  const OBS = `Obsidian Security is a SaaS security platform built on a knowledge graph correlating identity, access, activity, and posture across SaaS apps. GTM pillars: Access & Privilege Control, SaaS Supply Chain Resilience, SaaS Identity Threat Defense, AI Agent Governance, Compliance (GLBA/NYDFS/DORA). VAR partners: Optiv, GuidePoint, Presidio, WWT, EverSec. Primary buyers: CISO, SOC Manager, GRC, IAM, IR, App Owners.`;

  const OVERVIEW_SYS = `You are a sales intelligence analyst at Obsidian Security. ${OBS}\nFrom your knowledge of the company, extract structured intelligence.\nReturn JSON only:\n{"company_type":"...","website":"https://...","snapshot":[{"label":"...","value":"..."}],"signals":[{"title":"...","desc":"...","obsidian_angle":"...","tags":["hot"|"new"|"watch"]}]}\nReturn 3-6 signals focused on AI, SaaS security, identity, cloud, compliance. Snapshot: Company Type, Size, Revenue (est.), Key Verticals, HQ, Cloud/Tech Partner.`;

  const PEOPLE_ECON_SYS = `You are a sales intelligence analyst at Obsidian Security. ${OBS}\nIdentify named economic buyers at the company (CISO, CIO, CFO, VP Security).\nReturn JSON array only:\n[{"name":"...","title":"...","context":"...","linkedin":"https://linkedin.com/in/... or null","persona":"econ","obsidian_angle":"...","is_primary":true}]\nOnly include people you can name with confidence. Return [] if unsure.`;

  const PEOPLE_TECH_SYS = `You are a sales intelligence analyst at Obsidian Security. ${OBS}\nIdentify named technical buyers at the company (SOC Director, IAM Director, Security Engineering, Incident Response).\nReturn JSON array only:\n[{"name":"...","title":"...","context":"...","linkedin":"https://linkedin.com/in/... or null","persona":"tech","obsidian_angle":"...","is_primary":false}]\nOnly include people you can name with confidence. Return [] if unsure.`;

  const STACK_SYS = `You are a competitive intelligence analyst at Obsidian Security. ${OBS}\nCompetitors: AppOmni, Reco.AI, CrowdStrike Falcon Shield, Microsoft Defender for Cloud Apps, Grip Security, Palo Alto Prisma, Zscaler, Netskope.\nVAR partners: Optiv, GuidePoint, Presidio, WWT, EverSec.\nReturn JSON only:\n{"vendor_stack":[{"vendor":"...","category":"...","confidence":"high|medium|low|greenfield","notes":"...","obsidian_note":"..."}],"pillar_alignment":[{"pillar":"...","stars":1-5,"rationale":"..."}],"partner_presence":{"vars_found":[],"status":"covered|partial|none_detected","notes":"...","action_note":"..."},"competitor_presence":[{"name":"...","status":"entrenched|present|not_detected","notes":"..."}]}\nAlways include all 5 pillars. If no SSPM/CASB found, add greenfield row.`;

  // 4 parallel Haiku agents
  const [overview, econPeople, techPeople, stack] = await Promise.all([
    _callHaikuBrief(apiKey, OVERVIEW_SYS, `Company: ${company}`),
    _callHaikuBrief(apiKey, PEOPLE_ECON_SYS, `Company: ${company}`),
    _callHaikuBrief(apiKey, PEOPLE_TECH_SYS, `Company: ${company}`),
    _callHaikuBrief(apiKey, STACK_SYS, `Company: ${company}`),
  ]);

  const allPeople = [...(Array.isArray(econPeople) ? econPeople : []), ...(Array.isArray(techPeople) ? techPeople : [])];

  // Sonnet synthesis
  const SYNTH_SYS = `You are a senior GTM strategist at Obsidian Security. ${OBS}\nSynthesize research into a verdict and actions.\nReturn JSON only:\n{"verdict_priority":"High Potential|Medium Potential|Low Potential|Watch List","verdict_headline":"...","verdict_body":"2-3 sentences on best entry point","recommended_actions":["action 1","action 2","action 3","action 4","action 5"],"keywords":["kw1","kw2"]}`;

  const synthResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYNTH_SYS,
      messages: [{ role: 'user', content: `Company: ${company}\n\n${JSON.stringify({ overview, people: allPeople, stack })}` }],
    }),
  });
  const synthData = await synthResp.json();
  const synthRaw  = (synthData.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
  let synthesis = {};
  try { synthesis = JSON.parse(synthRaw); } catch {}

  return _renderBriefHtml(company, overview, allPeople, stack, synthesis);
}

function _renderBriefHtml(company, overview, people, stack, synthesis) {
  const now = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const e = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const stars = n => '★'.repeat(Math.max(0,Math.min(5,n||0))) + '<span style="color:#e0e0e0;">★</span>'.repeat(5-Math.max(0,Math.min(5,n||0)));
  const confBadge = c => ({ high:'<span style="color:#059669;font-weight:700;">● High</span>', medium:'<span style="color:#FF9D03;font-weight:700;">◐ Medium</span>', low:'<span style="color:#5a5a5a;font-weight:700;">○ Low</span>', greenfield:'<span style="color:#059669;font-weight:700;">● Greenfield</span>' })[String(c).toLowerCase()] || e(c);
  const verdictIcon = p => ({ 'high potential':'⚡','medium potential':'🔍','watch list':'👀' })[String(p||'').toLowerCase()] || '📋';

  const snapshotHtml = (overview.snapshot||[]).map(i=>`<div style="background:#F8F8F8;border:1px solid #e0e0e0;border-radius:6px;padding:12px 14px;"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#5a5a5a;margin-bottom:4px;">${e(i.label)}</div><div style="font-size:13px;font-weight:600;color:#131313;">${e(i.value)}</div></div>`).join('');

  const signalsHtml = (overview.signals||[]).map((s,i)=>{
    const tags = (s.tags||[]).map(t=>t==='hot'?'<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-top:5px;margin-right:4px;background:#fef3c7;color:#92400e;">🔥 Hot</span>':t==='new'?'<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-top:5px;margin-right:4px;background:#d1fae5;color:#065f46;">New</span>':'<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;margin-top:5px;margin-right:4px;background:#ede9fe;color:#5b21b6;">Watch</span>').join('');
    return `<div style="border:1px solid #e0e0e0;border-radius:6px;padding:12px 14px;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:flex-start;"><div style="background:#5565E2;color:#fff;font-size:10px;font-weight:700;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</div><div><div style="font-size:13px;font-weight:700;color:#0B173B;margin-bottom:3px;">${e(s.title)}</div><div style="font-size:12px;color:#131313;margin-bottom:4px;line-height:1.55;">${e(s.desc)}</div><div style="font-size:11px;color:#5a5a5a;padding-left:8px;border-left:2px solid #61CEF4;line-height:1.5;"><strong style="color:#5565E2;">Obsidian angle:</strong> ${e(s.obsidian_angle)}</div>${tags}</div></div>`;
  }).join('');

  const pillarsHtml = (stack.pillar_alignment||[]).map(p=>`<tr><td><strong>${e(p.pillar)}</strong></td><td style="color:#FF9D03;">${stars(p.stars)}</td><td>${e(p.rationale)}</td></tr>`).join('');

  const personaBadge = persona => ({ econ:'<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:#dbeafe;color:#1e40af;">Economic Buyer</span>', tech:'<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:#d1fae5;color:#065f46;">Technical Buyer</span>', risk:'<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:#ede9fe;color:#5b21b6;">GRC / Compliance</span>', ai:'<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:#fef3c7;color:#92400e;">AI & ML Security</span>' })[persona] || '';
  const peopleHtml = people.length ? people.map(p=>`<div style="border:1px solid ${p.is_primary?'#5565E2':'#e0e0e0'};border-radius:6px;padding:12px 14px;${p.is_primary?'background:rgba(85,101,226,0.04);':''}"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;"><div><div style="font-size:13px;font-weight:700;color:#0B173B;">${e(p.name)}</div><div style="font-size:11px;color:#5a5a5a;">${e(p.title)}</div></div>${p.linkedin?`<a href="${e(p.linkedin)}" target="_blank" style="font-size:10px;color:#5565E2;text-decoration:none;font-weight:500;">↗ LinkedIn</a>`:''}</div><div style="font-size:11px;color:#131313;line-height:1.5;">${e(p.context)}</div><div style="font-size:11px;color:#5565E2;margin-top:4px;">${e(p.obsidian_angle)}</div><div style="margin-top:6px;">${personaBadge(p.persona)}</div></div>`).join('') : '<p style="font-size:12px;color:#5a5a5a;">No named contacts identified. Run a LinkedIn search for this company.</p>';

  const stackHtml = (stack.vendor_stack||[]).map(v=>`<tr><td><strong>${e(v.vendor)}</strong></td><td>${e(v.category)}</td><td>${confBadge(v.confidence)}</td><td style="font-size:11px;">${e(v.notes)}${v.obsidian_note?` <strong>${e(v.obsidian_note)}</strong>`:''}</td></tr>`).join('');

  const pp = stack.partner_presence || {};
  const varsFound = pp.vars_found || [];
  const partnerHtml = `<div style="border:1px solid #e0e0e0;border-radius:6px;padding:14px 16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#5a5a5a;margin-bottom:10px;">VAR / Partner Presence</div><div style="font-size:13px;font-weight:700;color:#0B173B;">${varsFound.length ? 'Covered by: '+varsFound.map(e).join(', ') : 'No named VAR documented publicly'}</div><div style="font-size:12px;color:#131313;margin-top:3px;">${e(pp.notes)}</div>${pp.action_note?`<div style="font-size:11px;color:#5565E2;background:rgba(4,49,182,0.06);border-left:2px solid #5565E2;padding:5px 8px;margin-top:6px;border-radius:0 4px 4px 0;"><strong>What this means:</strong> ${e(pp.action_note)}</div>`:''}</div>`;

  const compHtml = `<div style="border:1px solid #e0e0e0;border-radius:6px;padding:14px 16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#5a5a5a;margin-bottom:10px;">Competitor Presence</div>${(stack.competitor_presence||[]).map(c=>`<div style="display:flex;gap:8px;margin-bottom:8px;"><span>${{entrenched:'🔴',present:'🟡',not_detected:'🟢'}[c.status]||'🟡'}</span><div><div style="font-size:12px;font-weight:700;color:#0B173B;">${e(c.name)}</div><div style="font-size:11px;color:#5a5a5a;">${e(c.notes)}</div></div></div>`).join('')}</div>`;

  const actionsHtml = (synthesis.recommended_actions||[]).map(a=>`<li style="font-size:12px;color:#131313;margin-bottom:4px;line-height:1.5;">${e(a)}</li>`).join('');
  const keywordsHtml = (synthesis.keywords||[]).map(k=>`<span style="background:#F8F8F8;border:1px solid #e0e0e0;color:#0B173B;font-size:11px;font-weight:500;padding:4px 10px;border-radius:14px;">${e(k)}</span>`).join('');

  const sectionTitle = label => `<div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5565E2;margin-bottom:10px;margin-top:24px;padding-bottom:4px;border-bottom:1px solid #e0e0e0;">${label}</div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${e(company)} — Scout Brief | Obsidian Ecosystem Radar</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;background:#F8F8F8;color:#131313;font-size:13px;line-height:1.6;}.page{max-width:860px;margin:0 auto;padding:40px 48px 60px;background:#fff;min-height:100vh;}table{width:100%;border-collapse:collapse;font-size:12px;}th{background:#0B173B;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;padding:8px 12px;text-align:left;}td{padding:9px 12px;border-bottom:1px solid #e0e0e0;vertical-align:top;}tr:last-child td{border-bottom:none;}tr:nth-child(even) td{background:#F8F8F8;}@media print{body{background:#fff;}.page{padding:24px 32px 40px;min-height:unset;max-width:100%;}}</style></head><body><div class="page">
<div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #0B173B;margin-bottom:24px;">
  <div><div style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#5565E2;margin-bottom:4px;">Obsidian Ecosystem Radar &nbsp;·&nbsp; Scout Brief</div><h1 style="font-size:26px;font-weight:800;color:#0B173B;">${e(company)}</h1></div>
  <div style="text-align:right;font-size:11px;color:#5a5a5a;line-height:1.8;"><div><strong>Date</strong> &nbsp;${e(now)}</div><div><strong>Category</strong> &nbsp;${e(overview.company_type||'')}</div><div><strong>Status</strong> &nbsp;Prospect</div>${overview.website?`<div><strong>Website</strong> &nbsp;<a href="${e(overview.website)}" target="_blank" style="color:#5565E2;">${e(overview.website.replace(/https?:\/\//,'').replace(/\/$/,''))}</a></div>`:''}</div>
</div>
<div style="background:linear-gradient(135deg,#0B173B 0%,#1a2d6b 100%);color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:16px;">
  <div style="font-size:28px;flex-shrink:0;">${verdictIcon(synthesis.verdict_priority)}</div>
  <div><div style="font-size:14px;font-weight:700;color:#FF9D03;margin-bottom:3px;">${e(synthesis.verdict_headline)}</div><p style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.5;">${e(synthesis.verdict_body)}</p></div>
</div>
${sectionTitle('Company Snapshot')}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:4px;">${snapshotHtml}</div>
${sectionTitle('Ecosystem Signals')}<div style="display:flex;flex-direction:column;gap:10px;">${signalsHtml}</div>
${sectionTitle('Obsidian Pillar Alignment')}<table><thead><tr><th>Pillar</th><th>Fit</th><th>Rationale</th></tr></thead><tbody>${pillarsHtml}</tbody></table>
${sectionTitle('Key People to Know')}<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${peopleHtml}</div>
${sectionTitle('Security Vendor Stack')}<table><thead><tr><th>Vendor / Tool</th><th>Category</th><th>Confidence</th><th>Notes</th></tr></thead><tbody>${stackHtml}</tbody></table>
${sectionTitle('Partner & Competitive Presence')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${partnerHtml}${compHtml}</div>
${keywordsHtml ? sectionTitle('Keywords to Use')+'<div style="display:flex;flex-wrap:wrap;gap:7px;">'+keywordsHtml+'</div>' : ''}
${actionsHtml ? sectionTitle('Recommended Actions')+'<div style="background:#fffbeb;border:1px solid #FF9D03;border-radius:6px;padding:14px 16px;"><div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px;">⚡ Recommended Actions</div><ul style="margin:0;padding-left:18px;">${actionsHtml}</ul></div>' : ''}
<div style="margin-top:32px;padding-top:14px;border-top:1px solid #e0e0e0;display:flex;align-items:center;justify-content:space-between;"><div style="font-size:11px;font-weight:700;color:#0B173B;">Obsidian <span style="color:#5565E2;">Ecosystem Radar</span></div><div style="font-size:10px;color:#5a5a5a;">Generated ${e(now)} &nbsp;·&nbsp; Internal Use Only</div></div>
</div></body></html>`;
}
