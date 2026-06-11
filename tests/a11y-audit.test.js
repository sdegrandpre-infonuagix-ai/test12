// Story 0.10 — Existing UI accessibility baseline audit (UX-DR17).
//
// Runs axe-core (via @axe-core/playwright) against public/index.html in a
// real headless Chromium, across the three view states named in the AC:
//   A. Unauthenticated landing (login modal auto-open)
//   B. Authenticated public-feed
//   C. Private-channel view (a private channel active, messages loaded)
//
// The backend is stubbed at the network layer (page.route) so the SPA boots
// and renders real component markup without a live server/DB. External
// resources (Google Fonts, Google/Apple sign-in SDKs) are aborted to keep
// runs deterministic and offline-safe; the app's system-font fallback keeps
// rendering (and therefore contrast) representative.
//
// Exit code: non-zero if ANY serious/critical (WCAG A/AA) violation remains.
// Moderate/minor findings are reported but do NOT fail the build — they are
// documented as follow-ups in the baseline report (see
// _bmad-output/planning-artifacts/a11y-baseline-2026-06-11.md).
//
// Run: node tests/a11y-audit.test.js   (or: npm run test:a11y)

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const { startStaticServer } = require('./support/static-server');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const RESULTS_FILE = path.join(__dirname, 'a11y-audit-results.json');

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);

const AUTH_USER = { phone: '+15555550123', displayName: 'TestUser' };
const SAMPLE_POSTS = {
  posts: [
    { id: '1', author: 'AlphaUser', text: 'Hello from the public feed.' },
    { id: '2', author: 'BetaUser', text: 'Voice posting works great!' },
  ],
};
const SAMPLE_CHANNELS = {
  channels: [
    { id: 'CH01', name: 'Design Crew', created_by: 'TestUser', created_at: '2026-06-01T10:00:00Z' },
    { id: 'CH02', name: 'Friends Hangout', created_by: 'SomeoneElse', created_at: '2026-06-02T12:00:00Z' },
  ],
};
const SAMPLE_MESSAGES = {
  messages: [
    { author: 'TestUser', text: 'First channel message.' },
    { author: 'SomeoneElse', text: 'Reply in the private channel.' },
  ],
};

// Stub /api/** and abort external origins for a context.
async function setupRoutes(context) {
  // Abort anything that isn't our loopback static server (fonts, GSI, AppleID).
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());

  await context.route('**/api/**', (route) => {
    const req = route.request();
    const url = req.url();
    const hasAuth = !!req.headers()['authorization'];
    const json = (obj, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });

    if (/\/api\/voice-posts(\?|$)/.test(url) && req.method() === 'GET') return json(SAMPLE_POSTS);
    if (/\/api\/channels\/[^/]+\/messages/.test(url)) return hasAuth ? json(SAMPLE_MESSAGES) : json({}, 401);
    if (/\/api\/channels(\?|$)/.test(url) && req.method() === 'GET') return hasAuth ? json(SAMPLE_CHANNELS) : json({}, 401);
    if (/\/api\/auth\/me/.test(url)) {
      return hasAuth
        ? json({ phone: AUTH_USER.phone, displayName: AUTH_USER.displayName, plan: 'standard' })
        : json({}, 401);
    }
    return json({}); // benign default for any other endpoint
  });
}

// Kill transitions/animations so axe never samples a mid-fade composited
// color (e.g. the login modal's white card at partial opacity over the dark
// backdrop reads as grey). Also settles the orb keyframe animations.
async function freezeMotion(page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important;}',
  });
}

async function runAxe(page) {
  await freezeMotion(page);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => (n.target || []).join(' ')),
    details: v.nodes.map((n) => {
      const check = [...(n.any || []), ...(n.all || []), ...(n.none || [])].find((c) => c.data);
      return { target: (n.target || []).join(' '), data: (check && check.data) || null };
    }),
    summary: (v.nodes[0] && v.nodes[0].failureSummary) || '',
  }));
}

async function main() {
  const server = await startStaticServer(PUBLIC);
  const browser = await chromium.launch();
  const scenarios = [];

  try {
    // ── A. Unauthenticated landing ────────────────────────────────
    {
      const ctx = await browser.newContext({ serviceWorkers: 'block' });
      await setupRoutes(ctx);
      const page = await ctx.newPage();
      await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
      // boot ran loadPublicPosts(); wait for the public feed to render
      await page.waitForFunction(
        () => document.querySelectorAll('#public-messages .ch-msg').length > 0,
        { timeout: 10000 }
      );
      // login modal auto-opens for an unauthenticated visitor
      scenarios.push({ key: 'unauth-landing', label: 'Unauthenticated landing (login modal open)', violations: await runAxe(page) });
      await ctx.close();
    }

    // ── B. Authenticated public-feed ──────────────────────────────
    const authedCtx = await browser.newContext({ serviceWorkers: 'block' });
    await setupRoutes(authedCtx);
    await authedCtx.addInitScript(() => {
      localStorage.setItem('authToken', 'test-token');
      localStorage.setItem('authUser', JSON.stringify({ phone: '+15555550123', displayName: 'TestUser' }));
    });
    {
      const page = await authedCtx.newPage();
      await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#header-auth-btns', { state: 'visible', timeout: 10000 });
      await page.waitForFunction(
        () => document.querySelectorAll('#public-messages .ch-msg').length > 0,
        { timeout: 10000 }
      );
      scenarios.push({ key: 'authed-feed', label: 'Authenticated public-feed', violations: await runAxe(page) });
      await page.close();
    }

    // ── C. Private-channel view ───────────────────────────────────
    {
      const page = await authedCtx.newPage();
      await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#header-auth-btns', { state: 'visible', timeout: 10000 });
      await page.waitForFunction(
        () => !!document.querySelector('#private-channels-created .channel-panel'),
        { timeout: 10000 }
      );
      // Activate the first created private channel and load its messages.
      await page.evaluate(async () => {
        const panel = document.querySelector('#private-channels-created .channel-panel');
        const id = panel.getAttribute('data-channel');
        if (typeof setActiveChannel === 'function') setActiveChannel(id);
        if (typeof loadChannelMessages === 'function') await loadChannelMessages(id);
      });
      await page.waitForFunction(
        () => !!document.querySelector('#private-channels-created .channel-panel .ch-msg'),
        { timeout: 10000 }
      );
      scenarios.push({ key: 'private-channel', label: 'Private-channel view (active + messages)', violations: await runAxe(page) });
      await page.close();
    }

    await authedCtx.close();
  } finally {
    await browser.close();
    await server.close();
  }

  // ── Report ────────────────────────────────────────────────────
  let blockingTotal = 0;
  const report = { tags: AXE_TAGS, generatedFor: 'Story 0.10 (UX-DR17)', scenarios: [] };

  for (const s of scenarios) {
    const blocking = s.violations.filter((v) => BLOCKING.has(v.impact));
    const other = s.violations.filter((v) => !BLOCKING.has(v.impact));
    blockingTotal += blocking.length;
    report.scenarios.push({ key: s.key, label: s.label, blocking, other });

    console.log(`\n=== ${s.label} ===`);
    console.log(`  serious/critical: ${blocking.length}   moderate/minor: ${other.length}`);
    for (const v of blocking) {
      console.error(`  [${v.impact.toUpperCase()}] ${v.id} (${v.nodes}×) — ${v.help}`);
      for (const t of v.targets) console.error(`        @ ${t}`);
    }
    for (const v of other) {
      console.log(`  [${v.impact}] ${v.id} (${v.nodes}×) — ${v.help}`);
    }
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`\nFull results written to ${path.relative(ROOT, RESULTS_FILE)}`);

  if (blockingTotal > 0) {
    console.error(`\nFAIL — ${blockingTotal} serious/critical accessibility violation(s) across views.`);
    process.exit(1);
  }
  console.log(`\nPASS — zero serious/critical accessibility violations across all ${scenarios.length} views.`);
}

main().catch((e) => {
  console.error('a11y-audit harness error:', e);
  process.exit(2);
});
