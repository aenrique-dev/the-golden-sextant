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
