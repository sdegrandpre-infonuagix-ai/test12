// Story 1.1 — vmode-* region: MODES config + vmodeFsm shell.
//
// Verifies the Voice-Mode Switcher foundation declared inside the marked
// region in public/index.html:
//   • MODES is a frozen 4-entry config with the spec'd shape/values
//   • vmodeFsm exists with state 'idle' and a logging transition() method
//
// MODES / vmodeFsm are top-level `const`s in a classic <script>, so they are
// reachable by bare identifier from page.evaluate but are NOT properties of
// `window` — hence the bare-name references below.

const { test, expect } = require('@playwright/test');

const EXPECTED = [
  { mode_id: 'llm', mode_name: 'Haiku 4.5', family: 'ptt', cost_tier: 'free', tier_label: 'Free' },
  { mode_id: 'deluxe-claude', mode_name: 'Sonnet 4.6', family: 'ptt', cost_tier: 'paid', tier_label: '$$' },
  { mode_id: 'deluxe-xai', mode_name: 'xAI Grok', family: 'realtime', cost_tier: 'paid', tier_label: '$$' },
  { mode_id: 'deluxe-openai', mode_name: 'OpenAI Realtime', family: 'realtime', cost_tier: 'premium', tier_label: '$$$' },
];

test.describe('Story 1.1 — vmode region (MODES + FSM shell)', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('MODES is a frozen 4-entry config with the spec\'d shape', async ({ page }) => {
    const modes = await page.evaluate(() => (typeof MODES !== 'undefined' ? MODES : null));
    expect(modes, 'MODES const must be defined in the vmode region').toBeTruthy();
    expect(Array.isArray(modes)).toBe(true);
    expect(modes).toHaveLength(4);

    const frozen = await page.evaluate(() => Object.isFrozen(MODES) && MODES.every((m) => Object.isFrozen(m)));
    expect(frozen, 'MODES (and each entry) must be Object.freeze()d').toBe(true);

    EXPECTED.forEach((exp, i) => {
      expect(modes[i]).toMatchObject(exp);
      expect(typeof modes[i].caption === 'string' && modes[i].caption.length, `MODES[${i}].caption`).toBeTruthy();
      expect(typeof modes[i].icon === 'string' && modes[i].icon.length, `MODES[${i}].icon`).toBeTruthy();
    });
  });

  test('vmodeFsm starts in idle with a logging transition()', async ({ page }) => {
    const fsm = await page.evaluate(() => ({
      defined: typeof vmodeFsm !== 'undefined',
      state: typeof vmodeFsm !== 'undefined' ? vmodeFsm.state : null,
      hasTransition: typeof vmodeFsm !== 'undefined' && typeof vmodeFsm.transition === 'function',
    }));
    expect(fsm.defined, 'vmodeFsm must be defined').toBe(true);
    expect(fsm.state, "vmodeFsm.state must start at 'idle'").toBe('idle');
    expect(fsm.hasTransition, 'vmodeFsm.transition must be a function').toBe(true);
  });

  test('transition() logs a [vmode-fsm] line for every call', async ({ page }) => {
    const logs = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await page.evaluate(() =>
      vmodeFsm.transition('voice_command_match', { mode_id: 'deluxe-claude', source: 'voice-command' })
    );
    await expect.poll(() => logs.find((l) => l.startsWith('[vmode-fsm]')) || null).not.toBeNull();
    const fsmLog = logs.find((l) => l.startsWith('[vmode-fsm]'));
    expect(fsmLog).toMatch(/idle → idle \(voice_command_match/);
  });
});
