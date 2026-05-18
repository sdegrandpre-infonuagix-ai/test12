const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove onclick from the reveal button so only the legacy listener fires
h = h.replace(
  '<button class="login-btn" id="login-reveal-btn" onclick="finishReveal()">Let\'s go! →</button>',
  '<button class="login-btn" id="login-reveal-btn">Let\'s go! →</button>'
);

// 2. Update the legacy revealBtn listener to also hide the reveal step before calling onLoggedIn
h = h.replace(
  'if (revealBtn) revealBtn.addEventListener(\'click\', () => { onLoggedIn(); });',
  `if (revealBtn) revealBtn.addEventListener('click', () => {
  document.getElementById('login-step-reveal-new').style.display = 'none';
  ['btn-google','btn-apple'].forEach(id => { const b=document.getElementById(id); if(b)b.style.display=''; });
  onLoggedIn();
});`
);

// 3. Remove the now-redundant finishReveal() function from the auth JS we injected
h = h.replace(
  `\nfunction finishReveal() {\n  document.getElementById('login-step-reveal-new').style.display = 'none';\n  document.getElementById('btn-google').style.display = '';\n  document.getElementById('btn-apple').style.display = '';\n  onLoggedIn();\n}\n`,
  '\n// finishReveal handled by revealBtn legacy listener\n'
);

fs.writeFileSync('public/index.html', h, 'utf8');

// Verify
const h2 = fs.readFileSync('public/index.html', 'utf8');
console.log('onclick removed:', !h2.includes('onclick="finishReveal()"'));
console.log('listener updated:', h2.includes("login-step-reveal-new').style.display = 'none'"));

// Syntax check
const { execSync } = require('child_process');
const scripts = [...h2.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const largest = scripts.reduce((a,b) => a[1].length>b[1].length?a:b);
fs.writeFileSync('_tmp_check.js', largest[1]);
try { execSync('node --check _tmp_check.js',{stdio:'pipe'}); console.log('✓ JS OK'); }
catch(e) { console.error('✗', e.stderr.toString().split('\n')[0]); }
