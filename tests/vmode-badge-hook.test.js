// Story 1.4 — hook renderVoiceModeBadge() into updateAgentUI().
//
// updateAgentUI() is the single funnel called after the plan/mode is known and
// from every mode-change path (plan discovery, voice-command switch,
// connect/disconnect). Story 1.4 appends one call to renderVoiceModeBadge() at
// its end so the badge can never drift from the live VA_MODE — without altering
// any existing updateAgentUI() behaviour (FE3 / NFR12: extend, don't replace).
//
// VA_MODE, updateAgentUI and renderVoiceModeBadge are top-level symbols in a
// classic <script>, reachable by bare identifier from page.evaluate.

const { test, expect } = require('@playwright/test');

// Each case pairs the badge expectations with the *existing* updateAgentUI()
// side effect (the connect-button label) so we prove the new line was appended,
// not substituted for the old behaviour.
// rgb values are the WCAG-AA tier shades (darker teal/red — see the contrast
// note in src/styles/tailwind.css).
const CASES = [
  { mode_id: 'llm',           name: 'Haiku 4.5',       chip: 'Free', variant: 'vmode-badge-free',    rgb: 'rgb(14, 116, 144)', connectLabel: '🎙️ Tap to speak' },
  { mode_id: 'deluxe-claude', name: 'Sonnet 4.6',      chip: '$$',   variant: 'vmode-badge-paid',    rgb: 'rgb(245, 158, 11)', connectLabel: '🧠 Tap to Speak (Sonnet)' },
  { mode_id: 'deluxe-xai',    name: 'xAI Grok',        chip: '$$',   variant: 'vmode-badge-paid',    rgb: 'rgb(245, 158, 11)', connectLabel: '🌟 Connect (xAI Grok-3)' },
  { mode_id: 'deluxe-openai', name: 'OpenAI Realtime', chip: '$$$',  variant: 'vmode-badge-premium', rgb: 'rgb(220, 38, 38)',  connectLabel: '🌟 Connect (OpenAI Realtime)' },
];

test.describe('Story 1.4 — badge render hooked into updateAgentUI()', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  for (const c of CASES) {
    test(`updateAgentUI() repaints the badge for ${c.mode_id} (and keeps the connect label)`, async ({ page }) => {
      // Pre-paint a *contrasting* mode straight through renderVoiceModeBadge()
      // so the badge starts wrong; then flip VA_MODE and call ONLY
      // updateAgentUI(). If the badge ends up correct, updateAgentUI() must
      // have invoked renderVoiceModeBadge() itself.
      const connectLabel = await page.evaluate(({ target }) => {
        const decoy = target === 'llm' ? 'deluxe-openai' : 'llm';
        VA_MODE = decoy; renderVoiceModeBadge();
        VA_MODE = target; updateAgentUI();
        return document.getElementById('connect-btn').textContent;
      }, { target: c.mode_id });

      const badge = page.locator('#vmode-badge');
      await expect(badge).toHaveClass(new RegExp(`\\b${c.variant}\\b`));
      await expect(badge.locator('.vmode-badge-name')).toHaveText(c.name);
      await expect(badge.locator('.vmode-badge-chip')).toHaveText(c.chip);

      const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe(c.rgb);

      // Existing updateAgentUI() behaviour is preserved (extend, not replace).
      expect(connectLabel).toBe(c.connectLabel);
    });
  }

  test('updateAgentUI() leaves the connect button + status wired (no throw, PTT defaults)', async ({ page }) => {
    const state = await page.evaluate(() => {
      VA_MODE = 'llm';
      updateAgentUI();
      return {
        connect: document.getElementById('connect-btn').textContent,
        status: document.getElementById('status').textContent,
        disconnectHidden: document.getElementById('disconnect-btn').style.display === 'none',
      };
    });
    expect(state.connect).toBe('🎙️ Tap to speak');
    expect(state.status).toBe('Tap to speak');
    expect(state.disconnectHidden).toBe(true);
  });
});
