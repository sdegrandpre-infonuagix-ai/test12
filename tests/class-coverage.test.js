// Class-coverage check: every `class="..."` token referenced in
// public/index.html must resolve to a rule somewhere — either in the
// migrated Tailwind component layer (src/styles/tailwind.css → compiled
// to public/dist/tailwind.css) or a surviving rule in the inline <style>
// block. Catches "I forgot to migrate this class" regressions from
// Stories 0.3–0.6.

const fs = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const HTML     = fs.readFileSync(path.join(ROOT, 'public', 'index.html'),     'utf8');
const TWCSS    = fs.readFileSync(path.join(ROOT, 'public', 'dist', 'tailwind.css'), 'utf8');

// Inline <style> block — between first <style> and </style> in head
const styleMatch = HTML.match(/<style>([\s\S]*?)<\/style>/);
const INLINE_CSS = styleMatch ? styleMatch[1] : '';

// Collect class tokens from every class="..." attribute. Skip Tailwind
// arbitrary-value classes since they're per-element utilities (e.g.
// flex-1, px-[14px]) — we trust Tailwind's purge to keep them.
const classRefs = new Set();
for (const m of HTML.matchAll(/\sclass="([^"]+)"/g)) {
  for (const tok of m[1].split(/\s+/)) {
    if (!tok) continue;
    // Skip JS template-literal placeholders like ${fillClass}: the
    // substituted value (e.g. "ok"/"warn"/"full") is a separate concrete
    // token elsewhere in the JS and covered by its own rule.
    if (tok.startsWith('${') || tok.includes('${')) continue;
    classRefs.add(tok);
  }
}

// Allowlist: Tailwind utility class prefixes / patterns we trust. If a
// class starts with any of these, we don't require it to appear in CSS.
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
function isTailwindUtility(name) {
  return TAILWIND_UTILITY_PATTERNS.some(re => re.test(name));
}

// Component classes from index.html that legitimately ship via tailwind.css
// (component layer) or remain in inline <style>. The check verifies CSS
// defines them somewhere. Hidden helper (Tailwind base preflight provides
// `.hidden { display: none }`) is shipped by Tailwind utility layer.
const missingFromCss = [];
for (const cls of classRefs) {
  if (isTailwindUtility(cls)) continue;
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selectorRegex = new RegExp(`\\.${escaped}[\\s{,:\\.#~+>\\[]`);
  const inTailwind = selectorRegex.test(TWCSS);
  const inInline   = selectorRegex.test(INLINE_CSS);
  if (!inTailwind && !inInline) {
    missingFromCss.push(cls);
  }
}

if (missingFromCss.length) {
  console.error('FAIL — classes referenced in index.html but not defined in tailwind.css or inline <style>:');
  for (const c of missingFromCss.sort()) console.error('  -', c);
  process.exit(1);
}

console.log(`PASS — all ${classRefs.size} class-references in index.html resolve to a CSS rule (or are recognized Tailwind utilities).`);
