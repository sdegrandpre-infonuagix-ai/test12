const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// Fix dispatchIntent: the catch block is empty and the function closing } is missing
h = h.replace(
  '  } catch (err) {\n}\n\n// ═══════════════════════════════════════════════════\n//  Mode-aware voice UI initialisation',
  '  } catch (err) {\n    log(\'error\', \'Agent error: \' + err.message);\n    setStatus(\'Error\'); setOrb(\'\');\n  }\n}\n\n// ═══════════════════════════════════════════════════\n//  Mode-aware voice UI initialisation'
);

fs.writeFileSync('public/index.html', h, 'utf8');

// Verify with node --check
const { execSync } = require('child_process');
const scripts = [...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const largest = scripts.reduce((a, b) => a[1].length > b[1].length ? a : b);
fs.writeFileSync('_tmp_check.js', largest[1], 'utf8');
try {
  execSync('node --check _tmp_check.js', { stdio: 'pipe' });
  console.log('✓ JS syntax OK');
} catch(e) {
  console.error('✗ Still has syntax error:', e.stderr.toString().split('\n')[0]);
}
