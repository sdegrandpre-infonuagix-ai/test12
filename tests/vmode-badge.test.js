// Story 1.3 — vmode-badge component (display-only).
//
// Verifies the header pill that shows the active voice mode + its cost tier
// (UX-DR3; FR1/FR8 "current mode always visible", FR9 "tier distinguishable
// without color alone"; partial NFR16/NFR18). Display-only in this story:
// tapping does NOT open a sheet yet (that lands in Epic 2), and the render is
// not yet wired into updateAgentUI() (Story 1.4).
//
// VA_MODE and renderVoiceModeBadge() are top-level symbols in a classic
// <script>, reachable by bare identifier from page.evaluate but NOT properties
// of `window` — hence the bare-name references below (same pattern as the
// Story 1.1 / 1.2 specs).

const { test, expect } = require('@playwright/test');

// variant/tierName/rgb are fixed by the design; name/chip/icon are asserted
// against the live MODES config in-page to avoid emoji-encoding drift.
const VARIANTS = [
  { mode_id: 'llm',           variant: 'vmode-badge-free',    tierName: 'Free',    rgb: 'rgb(21, 149, 178)' },
  { mode_id: 'deluxe-claude', variant: 'vmode-badge-paid',    tierName: 'Paid',    rgb: 'rgb(245, 158, 11)' },
  { mode_id: 'deluxe-xai',    variant: 'vmode-badge-paid',    tierName: 'Paid',    rgb: 'rgb(245, 158, 11)' },
  { mode_id: 'deluxe-openai', variant: 'vmode-badge-premium', tierName: 'Premium', rgb: 'rgb(239, 68, 68)' },
];

test.describe('Story 1.3 — vmode-badge (display-only)', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('badge is a native <button type=button> in the header chrome', async ({ page }) => {
    const badge = page.locator('#vmode-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveJSProperty('tagName', 'BUTTON');
    await expect(badge).toHaveAttribute('type', 'button');
    // Placeholder until Epic 2 wires the sheet open/close.
    await expect(badge).toHaveAttribute('aria-expanded', 'false');

    // Sibling of the existing header chrome controls (same parent as the
    // Log in link / Profile / Sign out buttons).
    const sharesHeaderParent = await page.evaluate(() => {
      const b = document.getElementById('vmode-badge');
      const hll = document.getElementById('header-login-link');
      const authBtns = document.getElementById('header-auth-btns');
      return !!b && !!hll && !!authBtns &&
        b.parentElement === hll.parentElement &&
        b.parentElement === authBtns.parentElement;
    });
    expect(sharesHeaderParent, '#vmode-badge must be a sibling of header-login-link / header-auth-btns').toBe(true);
  });

  test('renderVoiceModeBadge() is defined in the vmode region', async ({ page }) => {
    const hasFn = await page.evaluate(() => typeof renderVoiceModeBadge === 'function');
    expect(hasFn, 'renderVoiceModeBadge must be defined in the vmode region').toBe(true);
  });

  test('badge is hidden when no user is authenticated', async ({ page }) => {
    // Fresh load with no auth session → badge not displayed (mirrors the
    // #header-auth-btns display:none-until-login logic).
    await expect(page.locator('#vmode-badge')).toBeHidden();
  });

  for (const v of VARIANTS) {
    test(`renders the ${v.mode_id} variant (name, chip, icon, tier color, aria-label)`, async ({ page }) => {
      const m = await page.evaluate((id) => {
        VA_MODE = id;
        renderVoiceModeBadge();
        return MODES.find((x) => x.mode_id === id);
      }, v.mode_id);

      const badge = page.locator('#vmode-badge');
      await expect(badge).toHaveClass(new RegExp(`\\b${v.variant}\\b`));
      await expect(badge.locator('.vmode-badge-icon')).toHaveText(m.icon);
      await expect(badge.locator('.vmode-badge-name')).toHaveText(m.mode_name);
      await expect(badge.locator('.vmode-badge-dot')).toHaveText('·');
      await expect(badge.locator('.vmode-badge-chip')).toHaveText(m.tier_label);
      await expect(badge).toHaveAttribute(
        'aria-label',
        `Voice mode: ${m.mode_name}, ${v.tierName} tier. Tap to switch.`
      );

      // Cost-tier background (color reinforces, never replaces, the chip text).
      const bg = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe(v.rgb);
    });
  }

  test('chip uses literal Free / $$ / $$$ text (color-independent per FR9)', async ({ page }) => {
    const chips = [];
    for (const id of ['llm', 'deluxe-claude', 'deluxe-openai']) {
      const t = await page.evaluate((modeId) => {
        VA_MODE = modeId;
        renderVoiceModeBadge();
        return document.querySelector('#vmode-badge .vmode-badge-chip').textContent;
      }, id);
      chips.push(t);
    }
    expect(chips).toEqual(['Free', '$$', '$$$']);
  });

  test('tap target is at least 44 × 44 px', async ({ page }) => {
    // Force-visible (auth-gated in normal use) so the layout box is measurable.
    await page.evaluate(() => {
      VA_MODE = 'llm';
      renderVoiceModeBadge();
      document.getElementById('vmode-badge').style.display = 'inline-flex';
    });
    const box = await page.locator('#vmode-badge').boundingBox();
    expect(box.width, 'badge width ≥ 44px').toBeGreaterThanOrEqual(44);
    expect(box.height, 'badge height ≥ 44px').toBeGreaterThanOrEqual(44);
  });

  test('carries the focus-ring + active-scale utility classes (UX-DR3)', async ({ page }) => {
    const cls = await page.evaluate(() => document.getElementById('vmode-badge').className);
    expect(cls).toContain('focus-visible:ring-2');
    expect(cls).toContain('focus-visible:ring-brand-teal');
    expect(cls).toContain('active:scale-95');
  });
});
