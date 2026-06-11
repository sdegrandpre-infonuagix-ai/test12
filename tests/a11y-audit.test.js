// Story 0.10 — Existing UI accessibility baseline audit (UX-DR17).
//
// Runs axe-core (via @axe-core/playwright) against public/index.html across
// the three view states named in the AC. The backend is stubbed at the
// network layer so the SPA boots and renders real component markup with no
// live server/DB; external origins (fonts, Google/Apple SDKs) are aborted;
// motion is frozen so axe never samples a mid-fade composited colour.
//
// Gate: each view must have ZERO serious/critical (WCAG A/AA) violations.
// Moderate/minor findings are reported (see the baseline report) but do not
// fail the suite. Aggregated detail is written to tests/a11y-audit-results.json.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

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

// Aggregated across the serial describe, flushed in afterAll.
const collected = [];

async function setupRoutes(context) {
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
    return json({});
  });
}

async function seedAuth(context) {
  await context.addInitScript(() => {
    localStorage.setItem('authToken', 'test-token');
    localStorage.setItem('authUser', JSON.stringify({ phone: '+15555550123', displayName: 'TestUser' }));
  });
}

// Kill transitions/animations so axe never samples a mid-fade colour.
async function freezeMotion(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' });
}

async function auditBlocking(page, key, label) {
  await freezeMotion(page);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => (n.target || []).join(' ')),
  }));
  const blocking = violations.filter((v) => BLOCKING.has(v.impact));
  const other = violations.filter((v) => !BLOCKING.has(v.impact));
  collected.push({ key, label, blocking, other });
  return { blocking, other };
}

test.describe.configure({ mode: 'serial' });

test.describe('Story 0.10 — a11y baseline (WCAG 2.1 AA)', () => {
  test.afterAll(() => {
    fs.writeFileSync(
      RESULTS_FILE,
      JSON.stringify({ tags: AXE_TAGS, generatedFor: 'Story 0.10 (UX-DR17)', scenarios: collected }, null, 2)
    );
  });

  test('unauthenticated landing (login modal open) — 0 serious/critical', async ({ context, page }) => {
    await setupRoutes(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#public-messages .ch-msg').length > 0);
    const { blocking } = await auditBlocking(page, 'unauth-landing', 'Unauthenticated landing');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('authenticated public-feed — 0 serious/critical', async ({ context, page }) => {
    await setupRoutes(context);
    await seedAuth(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#header-auth-btns', { state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#public-messages .ch-msg').length > 0);
    const { blocking } = await auditBlocking(page, 'authed-feed', 'Authenticated public-feed');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('private-channel view (active + messages) — 0 serious/critical', async ({ context, page }) => {
    await setupRoutes(context);
    await seedAuth(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#header-auth-btns', { state: 'visible' });
    await page.waitForFunction(() => !!document.querySelector('#private-channels-created .channel-panel'));
    await page.evaluate(async () => {
      const panel = document.querySelector('#private-channels-created .channel-panel');
      const id = panel.getAttribute('data-channel');
      if (typeof setActiveChannel === 'function') setActiveChannel(id);
      if (typeof loadChannelMessages === 'function') await loadChannelMessages(id);
    });
    await page.waitForFunction(() => !!document.querySelector('#private-channels-created .channel-panel .ch-msg'));
    const { blocking } = await auditBlocking(page, 'private-channel', 'Private-channel view');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
