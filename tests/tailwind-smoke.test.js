// Verifies tailwind.config.js exposes the brand tokens documented in
// Story 0.2 / UX-DR1, by reading the compiled CSS and confirming each
// extended utility class compiles to the expected color or shadow value.

const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'dist', 'tailwind.css');
if (!fs.existsSync(cssPath)) {
  console.error('tailwind.css missing — run `npm run build:css` first');
  process.exit(1);
}
const css = fs.readFileSync(cssPath, 'utf8');

function ruleFor(selector) {
  const re = new RegExp(`\\${selector}\\{[^}]*\\}`, 'g');
  return (css.match(re) || []).join(' ');
}

const checks = [
  ['.bg-brand-teal',          'rgb(21 149 178'],
  ['.bg-brand-amber',         'rgb(245 158 11'],
  ['.bg-brand-red',           'rgb(239 68 68'],
  ['.bg-surface-dark',        'rgb(5 8 16'],
  ['.bg-surface-dark-elevated','rgb(30 41 59'],
  ['.text-text-primary',      'rgb(226 232 240'],
  ['.text-text-muted',        'rgb(100 116 139'],
  ['.bg-overlay-teal-faint',  'rgba(21,149,178,.08)'],
  ['.bg-overlay-teal-soft',   'rgba(21,149,178,.1)'],
  ['.bg-overlay-teal-medium', 'rgba(21,149,178,.2)'],
  ['.border-overlay-teal-edge','rgba(21,149,178,.3)'],
  ['.shadow-hover',           '0 4px 20px rgba(21,149,178,.12)'],
  ['.shadow-sheet',           '0 -8px 32px rgba(0,0,0,.4)'],
];

let fail = 0;
for (const [selector, needle] of checks) {
  const rule = ruleFor(selector);
  if (!rule) {
    console.error('MISSING SELECTOR:', selector);
    fail++;
    continue;
  }
  if (!rule.includes(needle)) {
    console.error('WRONG VALUE for', selector, '— expected to contain', needle, '; got', rule);
    fail++;
  }
}

// Inter must be wired as the default font family for `font-sans`.
if (!css.includes('font-family:Inter,sans-serif') &&
    !ruleFor('.font-sans').includes('Inter')) {
  console.error('MISSING: font-sans does not resolve to Inter');
  fail++;
}

if (fail) {
  console.error(`tailwind-smoke: ${fail} check(s) failed`);
  process.exit(1);
}
console.log(`tailwind-smoke: all ${checks.length + 1} brand-token checks passed`);
