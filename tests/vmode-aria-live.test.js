// Story 1.2 — vmode ARIA live region + announceVoiceMode() helper.
//
// Verifies the screen-reader announcement infrastructure (UX-DR10):
//   • #vmode-aria-live exists in the header chrome as a sibling of the
//     existing header-login-link / header-auth-btns, with the polite/atomic
//     ARIA live attributes and the sr-only class (visually hidden, SR-readable)
//   • announceVoiceMode(text) lives in the vmode region and updates the
//     element's text content
//
// announceVoiceMode is a top-level function in a classic <script>, so it is
// reachable by bare identifier from page.evaluate but is NOT a property of
// `window` — hence the bare-name reference below.

const { test, expect } = require('@playwright/test');

test.describe('Story 1.2 — vmode ARIA live region', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('#vmode-aria-live exists in header chrome with polite/atomic live attributes', async ({ page }) => {
    const live = page.locator('#vmode-aria-live');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveAttribute('aria-atomic', 'true');
    await expect(live).toHaveClass(/sr-only/);

    // Sibling of the existing header chrome controls (same parent <header>).
    const sharesHeaderParent = await page.evaluate(() => {
      const live = document.getElementById('vmode-aria-live');
      const hll = document.getElementById('header-login-link');
      const authBtns = document.getElementById('header-auth-btns');
      return !!live && !!hll && !!authBtns &&
        live.parentElement === hll.parentElement &&
        live.parentElement === authBtns.parentElement;
    });
    expect(sharesHeaderParent, '#vmode-aria-live must be a sibling of header-login-link / header-auth-btns').toBe(true);
  });

  test('the live region is visually hidden but present in the DOM', async ({ page }) => {
    // sr-only collapses the box to a 1px clipped rect — it occupies no visible space.
    const box = await page.locator('#vmode-aria-live').boundingBox();
    expect(box === null || (box.width <= 1 && box.height <= 1), 'sr-only region must be visually hidden').toBe(true);
  });

  test('announceVoiceMode(text) updates the live region text content', async ({ page }) => {
    const hasFn = await page.evaluate(() => typeof announceVoiceMode === 'function');
    expect(hasFn, 'announceVoiceMode must be defined in the vmode region').toBe(true);

    await page.evaluate(() => announceVoiceMode('Switched to Haiku 4.5, Standard tier.'));
    await expect(page.locator('#vmode-aria-live')).toHaveText('Switched to Haiku 4.5, Standard tier.');

    // A second announcement replaces the first (single persistent region).
    await page.evaluate(() => announceVoiceMode('Switched to Sonnet 4.6, $$ tier.'));
    await expect(page.locator('#vmode-aria-live')).toHaveText('Switched to Sonnet 4.6, $$ tier.');
  });
});
