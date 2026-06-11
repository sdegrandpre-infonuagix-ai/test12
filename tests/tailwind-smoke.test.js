// Verifies tailwind.config.js exposes the brand tokens documented in
// Story 0.2 / UX-DR1, by reading the compiled CSS and confirming each
// extended utility class compiles to the expected color or shadow value.
//
// Pure-node check (no browser) — runs under @playwright/test alongside the
// browser specs.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const cssPath = path.join(__dirname, '..', 'public', 'dist', 'tailwind.css');

const CHECKS = [
  ['.bg-brand-teal', 'rgb(21 149 178'],
  ['.bg-brand-amber', 'rgb(245 158 11'],
  ['.bg-brand-red', 'rgb(239 68 68'],
  ['.bg-surface-dark', 'rgb(5 8 16'],
  ['.bg-surface-dark-elevated', 'rgb(30 41 59'],
  ['.text-text-primary', 'rgb(226 232 240'],
  ['.text-text-muted', 'rgb(100 116 139'],
  ['.bg-overlay-teal-faint', 'rgba(21,149,178,.08)'],
  ['.bg-overlay-teal-soft', 'rgba(21,149,178,.1)'],
  ['.bg-overlay-teal-medium', 'rgba(21,149,178,.2)'],
  ['.border-overlay-teal-edge', 'rgba(21,149,178,.3)'],
  ['.shadow-hover', '0 4px 20px rgba(21,149,178,.12)'],
  ['.shadow-sheet', '0 -8px 32px rgba(0,0,0,.4)'],
];

test.describe('Tailwind brand tokens (Story 0.2 / UX-DR1)', () => {
  let css;
  test.beforeAll(() => {
    expect(fs.existsSync(cssPath), 'tailwind.css missing — run `npm run build:css` first').toBe(true);
    css = fs.readFileSync(cssPath, 'utf8');
  });

  const ruleFor = (selector) => {
    const re = new RegExp(`\\${selector}\\{[^}]*\\}`, 'g');
    return (css.match(re) || []).join(' ');
  };

  for (const [selector, needle] of CHECKS) {
    test(`${selector} compiles to ${needle}`, () => {
      const rule = ruleFor(selector);
      expect(rule, `missing selector ${selector}`).not.toBe('');
      expect(rule, `wrong value for ${selector}`).toContain(needle);
    });
  }

  test('font-sans resolves to Inter', () => {
    const ok = css.includes('font-family:Inter,sans-serif') || ruleFor('.font-sans').includes('Inter');
    expect(ok, 'font-sans does not resolve to Inter').toBe(true);
  });
});
