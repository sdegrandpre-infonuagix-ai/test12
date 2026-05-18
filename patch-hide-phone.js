const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// 1. Add id to phone button and divider so we can hide them
h = h.replace(
  '<button class="social-btn phone-btn" onclick="showPhoneStep()">',
  '<button class="social-btn phone-btn" id="btn-phone" onclick="showPhoneStep()">'
);
h = h.replace(
  '<div class="login-divider">or</div>\n        <button class="social-btn phone-btn"',
  '<div class="login-divider" id="login-divider-or">or</div>\n        <button class="social-btn phone-btn"'
);

// 2. Helper: all provider element IDs to hide/show
const PROVIDER_IDS = "['btn-google','btn-apple','btn-phone','login-divider-or']";

// 3. Update showProvidersStep to also show phone + divider
h = h.replace(
  `function showProvidersStep() {
  document.getElementById('login-step-phone-num').style.display = 'none';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = 'none';
  document.getElementById('btn-google').style.display = '';
  document.getElementById('btn-apple').style.display = '';
}`,
  `function showProvidersStep() {
  document.getElementById('login-step-phone-num').style.display = 'none';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = 'none';
  ${PROVIDER_IDS}.forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
}`
);

// 4. Update showPhoneStep to hide ALL provider buttons (not just Google/Apple)
h = h.replace(
  `function showPhoneStep() {
  document.getElementById('login-step-phone-num').style.display = '';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = 'none';
  document.getElementById('btn-google').style.display = 'none';
  document.getElementById('btn-apple').style.display = 'none';
  document.getElementById('login-phone-input')?.focus();
}`,
  `function showPhoneStep() {
  document.getElementById('login-step-phone-num').style.display = '';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = 'none';
  ${PROVIDER_IDS}.forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  document.getElementById('login-phone-input')?.focus();
}`
);

// 5. Update _applySession to hide ALL provider buttons when showing reveal
h = h.replace(
  `  document.getElementById('login-step-phone-num').style.display = 'none';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('btn-google').style.display = 'none';
  document.getElementById('btn-apple').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = '';`,
  `  document.getElementById('login-step-phone-num').style.display = 'none';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  ${PROVIDER_IDS}.forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  document.getElementById('login-step-reveal-new').style.display = '';`
);

// 6. Update the revealBtn listener to restore all providers
h = h.replace(
  `  document.getElementById('login-step-reveal-new').style.display = 'none';
  ['btn-google','btn-apple'].forEach(id => { const b=document.getElementById(id); if(b)b.style.display=''; });
  onLoggedIn();`,
  `  document.getElementById('login-step-reveal-new').style.display = 'none';
  ${PROVIDER_IDS}.forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
  onLoggedIn();`
);

fs.writeFileSync('public/index.html', h, 'utf8');

// Verify
const h2 = fs.readFileSync('public/index.html', 'utf8');
console.log('btn-phone id added:', h2.includes('id="btn-phone"'));
console.log('divider id added:', h2.includes('id="login-divider-or"'));

// Syntax check
const { execSync } = require('child_process');
const scripts = [...h2.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const largest = scripts.reduce((a,b) => a[1].length>b[1].length?a:b);
fs.writeFileSync('_tmp_check.js', largest[1]);
try { execSync('node --check _tmp_check.js',{stdio:'pipe'}); console.log('✓ JS OK'); }
catch(e) { console.error('✗', e.stderr.toString().split('\n')[0]); }
