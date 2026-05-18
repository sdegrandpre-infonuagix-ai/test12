const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// 1. Replace login box CSS (targeted replacements only)
h = h.replace(
  `    .login-box {
      background: #fff;
      border-radius: 16px;
      padding: 2.5rem 2.25rem 2rem;
      width: 100%; max-width: 400px;
      margin: 1rem;
      display: flex; flex-direction: column; gap: 0;
      box-shadow: 0 24px 64px rgba(0,0,0,0.35);
    }`,
  `    .login-box {
      background: #fff; border-radius: 18px;
      padding: 2.5rem 2.25rem 2rem;
      width: 100%; max-width: 400px; margin: 1rem;
      display: flex; flex-direction: column;
      box-shadow: 0 24px 64px rgba(0,0,0,0.4);
    }
    .social-btn {
      display:flex; align-items:center; justify-content:center; gap:0.65rem;
      width:100%; padding:13px 16px; margin-bottom:0.65rem;
      border-radius:10px; font-size:0.95rem; font-weight:600;
      font-family:inherit; cursor:pointer; transition:background 0.15s,box-shadow 0.15s;
      border:1.5px solid #e5e7eb; background:#fff; color:#0f172a;
    }
    .social-btn:hover { background:#f8fafc; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .social-btn svg { width:20px; height:20px; flex-shrink:0; }
    .social-btn.phone-btn { background:#0f172a; color:#fff; border-color:#0f172a; }
    .social-btn.phone-btn:hover { background:#1e293b; }
    .login-back {
      background:none; border:none; color:#64748b; font-size:0.85rem;
      cursor:pointer; font-family:inherit; padding:0.5rem 0; margin-top:0.25rem;
    }
    .login-back:hover { color:#374151; }`
);

// 2. Replace login modal HTML
const HTML_OLD = `  <!-- ═══ LOGIN MODAL ═══ -->
  <div id="login-overlay" class="hidden" style="display:none">
    <div class="login-box">
      <!-- Logo -->
      <div class="login-box-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1595b2"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 18.93V22h2v-2.07A8.001 8.001 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/></svg>
      </div>
      <h2>Welcome back</h2>
      <div class="login-box-subtitle">Sign in to Test 1 2</div>`;

const HTML_NEW = `  <!-- ═══ LOGIN MODAL ═══ -->
  <div id="login-overlay" class="hidden" style="display:none">
    <div class="login-box">
      <div class="login-box-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1595b2"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 18.93V22h2v-2.07A8.001 8.001 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/></svg>
      </div>
      <h2>Welcome</h2>
      <div class="login-box-subtitle">Sign in or create your account</div>`;

h = h.replace(HTML_OLD, HTML_NEW);

// 3. Replace the step-pin content with social buttons
const STEP_OLD = `      <!-- Step 1: USERID + PIN -->
      <div id="login-step-pin">
        <div class="login-field-wrap">
          <div class="login-field-label">USERNAME</div>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <input id="login-userid" list="uid-datalist" class="login-input"
              style="flex:1" placeholder="e.g. WOLF.PX7K3A2B"
              autocomplete="username" spellcheck="false">
            <datalist id="uid-datalist"></datalist>
            <button id="login-new-uid-btn" title="Switch account"
              style="width:40px;height:40px;flex-shrink:0;border-radius:10px;background:#f1f5f9;border:1.5px solid #e5e7eb;color:#374151;font-size:1.25rem;cursor:pointer;line-height:1;font-family:inherit;transition:background 0.15s">+</button>
          </div>
        </div>
        <div class="login-field-wrap" id="pin-input-wrap">
          <div class="login-field-label">PASSWORD <span style="font-weight:400;font-size:0.7rem;color:#9ca3af">(2 digits)</span></div>
          <input id="login-pin" class="login-input" type="password"
            placeholder="••" autocomplete="off" inputmode="numeric"
            style="letter-spacing:0.5em;font-size:1.4rem;text-align:center">
        </div>
        <button id="login-pin-btn" class="login-btn">Continue</button>
        <div class="login-divider">or</div>
        <button id="login-new-btn" class="login-btn secondary">Create account</button>
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #f1f5f9">
          <div class="voice-toggle-wrap">
            <label class="voice-toggle" title="Sign in by voice">
              <input type="checkbox" id="voice-login-checkbox">
              <span class="voice-toggle-track"><span class="voice-toggle-thumb"></span></span>
            </label>
            <span class="voice-toggle-label" style="color:#6b7280">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:1rem;height:1rem"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 18.93V22h2v-2.07A8.001 8.001 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/></svg>
              Sign in by voice
            </span>
          </div>
          <div id="voice-login-status" style="display:none;font-size:0.75rem;color:#1595b2;text-align:center;padding:0.3rem 0">
            <span id="voice-login-status-text"></span>
          </div>
        </div>
        <div id="login-error" class="login-error" style="display:none"></div>
      </div>`;

const STEP_NEW = `      <!-- Social provider buttons -->
      <div id="login-step-pin">
        <button class="social-btn" id="btn-google" onclick="authWithGoogle()">
          <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button class="social-btn" id="btn-apple" onclick="authWithApple()">
          <svg viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.4.07 2.38.74 3.2.8 1.22-.24 2.39-.93 3.68-.84 1.57.12 2.75.75 3.53 1.94-3.23 1.94-2.47 5.89.48 7.03-.57 1.52-1.32 3.02-2.89 3.93zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Continue with Apple
        </button>
        <div class="login-divider">or</div>
        <button class="social-btn phone-btn" onclick="showPhoneStep()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.96-.96a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Continue with phone
        </button>
        <div id="login-error" class="login-error" style="display:none"></div>
        <!-- Phone number step -->
        <div id="login-step-phone-num" style="display:none;margin-top:0.5rem">
          <div style="font-size:0.75rem;font-weight:600;color:#374151;margin-bottom:0.4rem">PHONE NUMBER</div>
          <input id="login-phone-input" class="login-input" type="tel"
            placeholder="+1 (555) 000-0000" inputmode="tel" autocomplete="tel">
          <button class="login-btn" style="margin-top:0.6rem" onclick="sendPhoneOtp()">Send code</button>
          <button class="login-back" onclick="showProvidersStep()">← Back</button>
          <div id="login-error-phone" class="login-error" style="display:none"></div>
        </div>
        <!-- OTP step -->
        <div id="login-step-otp-verify" style="display:none;margin-top:0.5rem">
          <p style="font-size:0.85rem;color:#374151;margin-bottom:0.75rem;text-align:center">
            Enter the 6-digit code sent to <strong id="login-phone-display"></strong>
          </p>
          <input id="login-otp-input" class="login-input" type="number"
            placeholder="123456" autocomplete="one-time-code"
            style="text-align:center;font-size:1.5rem;letter-spacing:0.25em">
          <button class="login-btn" style="margin-top:0.6rem" onclick="verifyPhoneOtp()">Verify code</button>
          <button class="login-back" onclick="showPhoneStep()">← Back</button>
          <div id="login-error-otp" class="login-error" style="display:none"></div>
        </div>
        <!-- Reveal username for new accounts -->
        <div id="login-step-reveal-new" style="display:none;margin-top:0.5rem">
          <p style="font-size:0.85rem;color:#374151;text-align:center;margin-bottom:0.75rem">Your username is:</p>
          <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;padding:1.25rem;text-align:center;margin-bottom:0.75rem">
            <div id="reveal-userid" style="font-size:1.4rem;font-weight:800;color:#1595b2;letter-spacing:0.05em"></div>
          </div>
          <p style="font-size:0.75rem;color:#ef4444;text-align:center;margin-bottom:0.75rem">Save this — it's your public username.</p>
          <button class="login-btn" id="login-reveal-btn" onclick="finishReveal()">Let's go! →</button>
        </div>
        <!-- Hidden stubs for JS compat -->
        <input id="login-userid" type="hidden">
        <input id="login-pin" type="hidden">
        <div id="pin-input-wrap" style="display:none"></div>
        <input type="checkbox" id="voice-login-checkbox" style="display:none">
        <div id="voice-login-status" style="display:none"><span id="voice-login-status-text"></span></div>
        <button id="login-new-uid-btn" style="display:none">+</button>
        <datalist id="uid-datalist"></datalist>
        <button id="login-pin-btn" style="display:none"></button>
        <button id="login-new-btn" style="display:none"></button>
      </div>`;

h = h.replace(STEP_OLD, STEP_NEW);

// 4. Add social auth JS before </script>
const AUTH_JS = `
// ── Social Auth (Google / Apple / Phone) ────────────────────────────────────
let _googleClientId = null, _appleServiceId = null;
let _phoneIdentifier = '';

(async function loadClientConfig() {
  try {
    const r = await fetch('/api/config/client');
    const cfg = r.ok ? await r.json() : {};
    _googleClientId = cfg.googleClientId || null;
    _appleServiceId = cfg.appleServiceId || null;
    if (_googleClientId) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; document.head.appendChild(s);
    }
    if (_appleServiceId) {
      const s = document.createElement('script');
      s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
      s.async = true; document.head.appendChild(s);
    }
  } catch(_) {}
})();

function showProvidersStep() {
  document.getElementById('login-step-phone-num').style.display = 'none';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = 'none';
  document.getElementById('btn-google').style.display = '';
  document.getElementById('btn-apple').style.display = '';
}
function showPhoneStep() {
  document.getElementById('login-step-phone-num').style.display = '';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = 'none';
  document.getElementById('btn-google').style.display = 'none';
  document.getElementById('btn-apple').style.display = 'none';
  document.getElementById('login-phone-input')?.focus();
}
function _showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 6000);
}

async function authWithGoogle() {
  if (!_googleClientId) { _showErr('login-error','Google sign-in not configured.'); return; }
  const btn = document.getElementById('btn-google');
  if (btn) btn.disabled = true;
  try {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: _googleClientId, scope: 'openid email profile', ux_mode: 'popup',
      callback: async (resp) => {
        if (resp.error) { if (btn) btn.disabled=false; return; }
        await _finishSocialAuth('/api/auth/google', { code: resp.code });
      },
    });
    client.requestCode();
  } catch(e) { _showErr('login-error', e.message); if (btn) btn.disabled=false; }
}

async function authWithApple() {
  if (!_appleServiceId) { _showErr('login-error','Apple sign-in not configured.'); return; }
  try {
    AppleID.auth.init({ clientId: _appleServiceId, scope: 'name email',
      redirectURI: window.location.origin, usePopup: true });
    const data = await AppleID.auth.signIn();
    await _finishSocialAuth('/api/auth/apple', { id_token: data.authorization.id_token, user: data.user||null });
  } catch(e) { if (e?.error !== 'popup_closed_by_user') _showErr('login-error', e?.error||'Apple failed'); }
}

async function sendPhoneOtp() {
  const raw = (document.getElementById('login-phone-input')?.value||'').trim();
  if (!raw) { _showErr('login-error-phone','Enter your phone number.'); return; }
  const btn = document.querySelector('#login-step-phone-num .login-btn');
  if (btn) { btn.disabled=true; btn.textContent='Sending…'; }
  try {
    const r = await fetch('/api/auth/send-otp', { method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({identifier:raw}) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error||'Failed to send');
    _phoneIdentifier = raw;
    const disp = document.getElementById('login-phone-display');
    if (disp) disp.textContent = raw;
    document.getElementById('login-step-phone-num').style.display = 'none';
    document.getElementById('login-step-otp-verify').style.display = '';
    document.getElementById('login-otp-input')?.focus();
  } catch(e) { _showErr('login-error-phone', e.message);
  } finally { if (btn) { btn.disabled=false; btn.textContent='Send code'; } }
}

async function verifyPhoneOtp() {
  const code = (document.getElementById('login-otp-input')?.value||'').trim();
  if (!code) { _showErr('login-error-otp','Enter the code.'); return; }
  const btn = document.querySelector('#login-step-otp-verify .login-btn');
  if (btn) { btn.disabled=true; btn.textContent='Verifying…'; }
  try {
    const r = await fetch('/api/auth/verify-otp', { method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({identifier:_phoneIdentifier,code}) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error||'Invalid code');
    await _applySession(d);
  } catch(e) { _showErr('login-error-otp', e.message);
  } finally { if (btn) { btn.disabled=false; btn.textContent='Verify code'; } }
}

async function _finishSocialAuth(endpoint, body) {
  try {
    const r = await fetch(endpoint, { method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error||'Auth failed');
    await _applySession(d);
  } catch(e) {
    _showErr('login-error', e.message);
    ['btn-google','btn-apple'].forEach(id => { const b=document.getElementById(id); if(b)b.disabled=false; });
  }
}

async function _applySession(d) {
  setAuthSession(d.token, d.identifier, d.displayName);
  currentUser = { token:d.token, phone:d.identifier, displayName:d.displayName };
  // Fetch canonical displayName (generated username)
  try {
    const me = await fetch('/api/auth/me', { headers:{'Authorization':'Bearer '+d.token} });
    if (me.ok) { const u = await me.json(); currentUser.displayName = u.displayName || d.displayName; }
  } catch(_) {}
  const username = currentUser.displayName || '';
  const el = document.getElementById('reveal-userid');
  if (el) el.textContent = username;
  // Show reveal step so user sees their auto-generated username
  document.getElementById('login-step-phone-num').style.display = 'none';
  document.getElementById('login-step-otp-verify').style.display = 'none';
  document.getElementById('btn-google').style.display = 'none';
  document.getElementById('btn-apple').style.display = 'none';
  document.getElementById('login-step-reveal-new').style.display = '';
}

function finishReveal() {
  document.getElementById('login-step-reveal-new').style.display = 'none';
  document.getElementById('btn-google').style.display = '';
  document.getElementById('btn-apple').style.display = '';
  onLoggedIn();
}
`;

const scriptClose = h.lastIndexOf('\n</script>');
h = h.slice(0, scriptClose) + '\n' + AUTH_JS + h.slice(scriptClose);

fs.writeFileSync('public/index.html', h, 'utf8');
console.log('Written. Size:', fs.statSync('public/index.html').size);

// Syntax check
const { execSync } = require('child_process');
const scripts = [...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
if (!scripts.length) { console.error('No inline script found!'); process.exit(1); }
const largest = scripts.reduce((a,b) => a[1].length>b[1].length?a:b);
fs.writeFileSync('_tmp_check.js', largest[1]);
try { execSync('node --check _tmp_check.js',{stdio:'pipe'}); console.log('✓ JS OK'); }
catch(e) { console.error('✗', e.stderr.toString().split('\n')[0]); }
