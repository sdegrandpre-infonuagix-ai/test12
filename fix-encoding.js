/**
 * fix-encoding.js
 * Repairs Windows-1252 double-encoding corruption in UTF-8 project files.
 * Run with: node fix-encoding.js [file1] [file2] ...
 * Or without args to fix all known corrupted project files.
 *
 * SAFE: only writes if corruption is actually detected.
 * Never use PowerShell Get-Content/Set-Content on these files.
 */
const fs = require('fs');
const path = require('path');

// Windows-1252 codepoints that differ from Latin-1
const WIN1252 = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E,
  0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6,
  0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152,
  0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
  0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A,
  0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
};

// Build reverse map: Unicode codepoint → Win-1252 byte
const REV = {};
for (let b = 0; b < 256; b++) REV[WIN1252[b] || b] = b;

const CORRUPT_RE = /Ã|â€|Ã¢|Ã‚|Â·|Â—|â€™|â€œ|Ã©|Ã |Ã®|Ã´|Ã»/;

function fixFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!CORRUPT_RE.test(text)) {
    console.log(`  ✓ ${path.basename(filePath)} — already clean`);
    return;
  }

  // Re-encode: walk Unicode codepoints, map back to Win-1252 bytes
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp in REV) {
      bytes.push(REV[cp]);
    } else if (cp < 256) {
      bytes.push(cp);
    } else {
      // Genuine non-Latin Unicode (e.g. emoji) — keep as UTF-8
      bytes.push(...Buffer.from(ch, 'utf8'));
    }
  }
  const fixed = Buffer.from(bytes).toString('utf8');

  // Verify fix worked
  if (CORRUPT_RE.test(fixed)) {
    console.log(`  ✗ ${path.basename(filePath)} — could not fully fix (manual review needed)`);
    return;
  }

  fs.writeFileSync(filePath, Buffer.from(fixed, 'utf8'));
  console.log(`  ✓ ${path.basename(filePath)} — fixed`);
}

// Files to fix (add more as needed)
const DEFAULT_FILES = [
  'public/index.html',
  'public/voice-agent.html',
  'public/channel.html',
  'public/private.html',
  'public/upgrade.html',
  'app.js',
].map(f => path.resolve(__dirname, f));

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map(f => path.resolve(f))
  : DEFAULT_FILES;

console.log('Fixing encoding corruption...');
targets.forEach(f => {
  if (!fs.existsSync(f)) return;
  try { fixFile(f); } catch (e) { console.log(`  ✗ ${f}: ${e.message}`); }
});
console.log('Done.');
