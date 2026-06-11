// Story 1.1 — vmode-* region: MODES config + vmodeFsm shell.
//
// Verifies the Voice-Mode Switcher foundation declared inside the marked
// region in public/index.html:
//   • MODES is a frozen 4-entry config with the spec'd shape/values
//   • vmodeFsm exists with state 'idle' and a logging transition() method
//
// Reuses the Playwright + loopback-static-server infra already present from
// Story 0.10 (no new test framework introduced — per architecture). MODES /
// vmodeFsm are top-level `const`s in a classic <script>, so they are reachable
// by bare identifier from page.evaluate but are NOT properties of `window`.
//
// Run: node tests/vmode-config.test.js

const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const { startStaticServer } = require('./support/static-server');

const PUBLIC = path.join(__dirname, '..', 'public');

const EXPECTED = [
  { mode_id: 'llm', mode_name: 'Haiku 4.5', family: 'ptt', cost_tier: 'free', tier_label: 'Free' },
  { mode_id: 'deluxe-claude', mode_name: 'Sonnet 4.6', family: 'ptt', cost_tier: 'paid', tier_label: '$$' },
  { mode_id: 'deluxe-xai', mode_name: 'xAI Grok', family: 'realtime', cost_tier: 'paid', tier_label: '$$' },
  { mode_id: 'deluxe-openai', mode_name: 'OpenAI Realtime', family: 'realtime', cost_tier: 'premium', tier_label: '$$$' },
];

async function main() {
  const server = await startStaticServer(PUBLIC);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  const logs = [];
  const page = await ctx.newPage();
  page.on('console', (msg) => logs.push(msg.text()));

  try {
    await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });

    // ── MODES ────────────────────────────────────────────────
    const modes = await page.evaluate(() => (typeof MODES !== 'undefined' ? MODES : null));
    assert.ok(modes, 'MODES const must be defined in the vmode region');
    assert.ok(Array.isArray(modes), 'MODES must be an array');
    assert.strictEqual(modes.length, 4, 'MODES must have exactly 4 entries');

    const frozen = await page.evaluate(
      () => Object.isFrozen(MODES) && MODES.every((m) => Object.isFrozen(m))
    );
    assert.ok(frozen, 'MODES (and each entry) must be Object.freeze()d');

    EXPECTED.forEach((exp, i) => {
      const m = modes[i];
      for (const key of Object.keys(exp)) {
        assert.strictEqual(m[key], exp[key], `MODES[${i}].${key} expected "${exp[key]}", got "${m[key]}"`);
      }
      assert.ok(typeof m.caption === 'string' && m.caption.length, `MODES[${i}].caption must be a non-empty string`);
      assert.ok(typeof m.icon === 'string' && m.icon.length, `MODES[${i}].icon must be a non-empty emoji string`);
    });

    // ── vmodeFsm ─────────────────────────────────────────────
    const fsm = await page.evaluate(() => ({
      defined: typeof vmodeFsm !== 'undefined',
      state: typeof vmodeFsm !== 'undefined' ? vmodeFsm.state : null,
      hasTransition: typeof vmodeFsm !== 'undefined' && typeof vmodeFsm.transition === 'function',
    }));
    assert.ok(fsm.defined, 'vmodeFsm must be defined in the vmode region');
    assert.strictEqual(fsm.state, 'idle', "vmodeFsm.state must start at 'idle'");
    assert.ok(fsm.hasTransition, 'vmodeFsm.transition must be a function');

    // transition() must log a '[vmode-fsm]' line for every call
    const before = logs.length;
    await page.evaluate(() =>
      vmodeFsm.transition('voice_command_match', { mode_id: 'deluxe-claude', source: 'voice-command' })
    );
    const newLogs = logs.slice(before);
    const fsmLog = newLogs.find((l) => l.startsWith('[vmode-fsm]'));
    assert.ok(fsmLog, "vmodeFsm.transition() must console.log a line prefixed '[vmode-fsm]'");
    assert.ok(/idle → idle \(voice_command_match/.test(fsmLog), `unexpected FSM log format: ${fsmLog}`);

    console.log('PASS — vmode region: MODES (4 frozen entries) + vmodeFsm shell verified.');
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error('FAIL —', e.message);
  process.exit(1);
});
