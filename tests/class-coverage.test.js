// Class-coverage check: every `class="..."` token referenced in
// public/index.html must resolve to a rule somewhere — either in the
// migrated Tailwind component layer (src/styles/tailwind.css → compiled
// to public/dist/tailwind.css) or a surviving rule in the inline <style>
// block. Catches "I forgot to migrate this class" regressions from
// Stories 0.3–0.6.
//
// Pure-node check (no browser) — runs under @playwright/test.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const TWCSS = fs.readFileSync(path.join(ROOT, 'public', 'dist', 'tailwind.css'), 'utf8');

// Inline <style> block — between first <style> and </style> in head
const styleMatch = HTML.match(/<style>([\s\S]*?)<\/style>/);
const INLINE_CSS = styleMatch ? styleMatch[1] : '';

// Tailwind utility class prefixes / patterns we trust without a CSS lookup.
const TAILWIND_UTILITY_PATTERNS = [
  /^(absolute|relative|fixed|sticky|static)$/,
  /^(flex|inline-flex|grid|block|inline|inline-block|hidden|table)/,
  /^(items-|justify-|self-|content-|place-)/,
  /^(gap-|space-)/,
  /^(p[xytlrb]?-|m[xytlrb]?-|mt-|mb-|ml-|mr-|mx-|my-)/,
  /^(w-|h-|min-w-|min-h-|max-w-|max-h-)/,
  /^(text-|font-|leading-|tracking-|whitespace-)/,
  /^(bg-|border|rounded|shadow|opacity|outline|ring|fill|stroke)/,
  /^(cursor-|select-|pointer-events-)/,
  /^(overflow-|truncate|break-)/,
  /^(transition|duration-|ease-|delay-|animate-)/,
  /^(transform|rotate-|scale-|translate-|skew-|origin-)/,
  /^(grid-cols-|grid-rows-|col-|row-)/,
  /^(top-|bottom-|left-|right-|inset-)/,
  /^(z-)/,
  /^(uppercase|lowercase|capitalize|italic|underline|line-through|no-underline)/,
  /^(sr-only|not-sr-only)$/,
  /^(visible|invisible|collapse)$/,
  /^(flex-1|flex-auto|flex-none|flex-col|flex-row|flex-wrap|flex-shrink|flex-grow|shrink|grow)/,
];
// Tailwind variant prefixes (state/responsive/media). A class like
// `focus-visible:ring-2` is the `ring-2` utility under the `focus-visible:`
// variant; Tailwind compiles it to a `.focus-visible\:ring-2:focus-visible`
// selector (colon escaped), which the plain `.<class>` lookup below cannot
// match. Strip recognized variant prefixes before the utility/selector check
// so variant-prefixed utilities (introduced from Story 1.3 onward — focus
// rings, active scale, and the motion-safe/md responsive variants the sheet
// uses) are trusted the same as their bare forms.
const VARIANT_PREFIXES = [
  'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'disabled',
  'visited', 'checked', 'required', 'group-hover', 'peer-focus', 'peer-checked',
  'motion-safe', 'motion-reduce', 'dark', 'first', 'last', 'odd', 'even',
  'sm', 'md', 'lg', 'xl', '2xl',
];
const stripVariants = (name) => {
  let n = name;
  for (let changed = true; changed; ) {
    changed = false;
    for (const v of VARIANT_PREFIXES) {
      if (n.startsWith(v + ':')) { n = n.slice(v.length + 1); changed = true; }
    }
  }
  return n;
};
const isTailwindUtility = (name) => {
  const base = stripVariants(name);
  return TAILWIND_UTILITY_PATTERNS.some((re) => re.test(base));
};

test('every class in index.html resolves to a CSS rule (or known Tailwind utility)', () => {
  const classRefs = new Set();
  for (const m of HTML.matchAll(/\sclass="([^"]+)"/g)) {
    for (const tok of m[1].split(/\s+/)) {
      if (!tok) continue;
      if (tok.startsWith('${') || tok.includes('${')) continue; // JS template placeholders
      classRefs.add(tok);
    }
  }

  const missingFromCss = [];
  for (const cls of classRefs) {
    if (isTailwindUtility(cls)) continue;
    const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const selectorRegex = new RegExp(`\\.${escaped}[\\s{,:\\.#~+>\\[]`);
    if (!selectorRegex.test(TWCSS) && !selectorRegex.test(INLINE_CSS)) {
      missingFromCss.push(cls);
    }
  }

  expect(missingFromCss.sort(), `classes referenced in index.html but not defined in CSS: ${missingFromCss.join(', ')}`).toEqual([]);
});
