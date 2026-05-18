/**
 * patch-login-ui.js
 * 1. Redesigns the login modal to a clean ChatGPT-style card
 * 2. Adds auto-show call in initAuth for unauthenticated users
 */
const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// ── 1. Replace login modal CSS ──────────────────────────────────────────────
h = h.replace(
  `    /* ── Login Modal ── */
    #login-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(5,8,16,0.92);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.3s;
    }
    #login-overlay.hidden { opacity: 0; pointer-events: none; }
    .login-box {
      background: rgba(15,23,42,0.95);
      border: 1px solid rgba(21,149,178,0.35);
      border-radius: 20px;
      padding: 2.5rem 2rem;
      width: 100%; max-width: 380px;
      margin: 1rem;
      display: flex; flex-direction: column; gap: 1.25rem;
    }
    .login-box h2 {
      font-size: 1.2rem; font-weight: 700; color: #1595b2;
      text-align: center;
    }
    .login-box p.hint {
      font-size: 0.82rem; color: #64748b; text-align: center; line-height: 1.5;
    }
    /* Each step is a flex column so elements are evenly spaced */
    #login-step-phone, #login-step-otp, #login-step-name {
      display: flex; flex-direction: column; gap: 0.9rem;
    }
    #login-step-phone hr { border: none; border-top: 1px solid rgba(21,149,178,0.15); margin: 0; }
    .login-input {
      width: 100%; padding: 12px 14px;
      background: rgba(21,149,178,0.08);
      border: 1px solid rgba(21,149,178,0.3);
      border-radius: 10px;
      color: #e2e8f0; font-size: 1rem; font-family: inherit;
      outline: none; transition: border-color 0.2s;
    }
    .login-input:focus { border-color: #1595b2; }
    .login-btn {
      width: 100%; padding: 13px;
      background: #1595b2; color: #fff;
      border: none; border-radius: 10px;
      font-size: 1rem; font-weight: 700; font-family: inherit;
      cursor: pointer; transition: opacity 0.15s;
    }
    .login-btn:hover { opacity: 0.88; }
    .login-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .login-error { color: #f87171; font-size: 0.82rem; text-align: center; }`,

  `    /* ── Login Modal — ChatGPT-style ── */
    #login-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.7);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.25s;
    }
    #login-overlay.hidden { opacity: 0; pointer-events: none; }
    .login-box {
      background: #fff;
      border-radius: 16px;
      padding: 2.5rem 2.25rem 2rem;
      width: 100%; max-width: 400px;
      margin: 1rem;
      display: flex; flex-direction: column; gap: 0;
      box-shadow: 0 24px 64px rgba(0,0,0,0.35);
    }
    .login-box-logo {
      display: flex; justify-content: center; margin-bottom: 1.5rem;
    }
    .login-box-logo svg { width: 40px; height: 40px; }
    .login-box h2 {
      font-size: 1.65rem; font-weight: 700; color: #0f172a;
      text-align: center; margin-bottom: 0.35rem; letter-spacing: -0.02em;
    }
    .login-box-subtitle {
      font-size: 0.88rem; color: #64748b; text-align: center;
      margin-bottom: 1.75rem; line-height: 1.5;
    }
    .login-box p.hint {
      font-size: 0.82rem; color: #64748b; text-align: center; line-height: 1.5;
    }
    .login-field-label {
      font-size: 0.75rem; font-weight: 600; color: #374151;
      letter-spacing: 0.04em; margin-bottom: 0.3rem;
    }
    .login-field-wrap { margin-bottom: 1rem; }
    #login-step-phone, #login-step-otp, #login-step-name {
      display: flex; flex-direction: column; gap: 0.9rem;
    }
    #login-step-phone hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.5rem 0; }
    .login-input {
      width: 100%; padding: 13px 14px;
      background: #f9fafb;
      border: 1.5px solid #e5e7eb;
      border-radius: 10px;
      color: #0f172a; font-size: 1rem; font-family: inherit;
      outline: none; transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }
    .login-input:focus {
      border-color: #1595b2;
      box-shadow: 0 0 0 3px rgba(21,149,178,0.12);
      background: #fff;
    }
    .login-btn {
      width: 100%; padding: 13px;
      background: #0f172a; color: #fff;
      border: none; border-radius: 10px;
      font-size: 0.97rem; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: background 0.15s, transform 0.1s;
      margin-top: 0.25rem;
    }
    .login-btn:hover { background: #1e293b; }
    .login-btn:active { transform: scale(0.99); }
    .login-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .login-btn.secondary {
      background: transparent; color: #374151;
      border: 1.5px solid #e5e7eb; margin-top: 0.6rem;
      font-weight: 500;
    }
    .login-btn.secondary:hover { background: #f9fafb; }
    .login-divider {
      display: flex; align-items: center; gap: 0.75rem;
      margin: 1.1rem 0 0.9rem; color: #9ca3af; font-size: 0.8rem;
    }
    .login-divider::before, .login-divider::after {
      content: ''; flex: 1; height: 1px; background: #e5e7eb;
    }
    .login-error { color: #ef4444; font-size: 0.82rem; text-align: center; margin-top: 0.25rem; }`
);

// ── 2. Replace login modal HTML ────────────────────────────────────────────
h = h.replace(
  `  <!-- ═══ LOGIN MODAL ═══ -->
  <div id="login-overlay" class="hidden" style="display:none">
    <div class="login-box">
      <h2>Welcome to Test 1 2</h2>

      <!-- Step 1: USERID + PIN -->
      <div id="login-step-pin">
        <div style="margin-bottom:0.55rem">
          <div style="font-size:0.7rem;font-weight:600;color:#64748b;letter-spacing:0.06em;margin-bottom:0.3rem">USERNAME</div>
          <div style="display:flex;gap:0.4rem;align-items:center">
            <input id="login-userid" list="uid-datalist" class="login-input"
              style="flex:1;margin:0" placeholder="e.g. WOLF.PX7K3A2B"
              autocomplete="username" spellcheck="false">
            <datalist id="uid-datalist"></datalist>
            <button id="login-new-uid-btn" title="Add a different username (voice or type)"
              style="width:38px;height:38px;border-radius:8px;background:rgba(21,149,178,0.12);border:1px solid rgba(21,149,178,0.4);color:#1595b2;font-size:1.35rem;cursor:pointer;flex-shrink:0;line-height:1;font-family:inherit">+</button>
          </div>
        </div>
        <div style="margin-bottom:0.7rem">
          <div style="font-size:0.7rem;font-weight:600;color:#64748b;letter-spacing:0.06em;margin-bottom:0.3rem">PASSWORD <span style="font-weight:400;font-size:0.65rem">(2 digits)</span></div>
          <input id="login-pin" class="login-input" type="password"
            placeholder="••" autocomplete="off" inputmode="numeric"
            style="letter-spacing:0.5em;font-size:1.4rem;text-align:center;margin:0">
        </div>
        <button id="login-pin-btn" class="login-btn" style="margin-bottom:0.4rem">Login</button>
        <button id="login-new-btn" class="login-btn"
          style="background:rgba(21,149,178,0.08);border:1px solid rgba(21,149,178,0.35);color:#1595b2;font-size:0.85rem">
          Create Profile
        </button>
        <hr style="margin:0.6rem 0">
        <div class="voice-toggle-wrap">
          <label class="voice-toggle" title="Connect Voice Agent">
            <input type="checkbox" id="voice-login-checkbox">
            <span class="voice-toggle-track"><span class="voice-toggle-thumb"></span></span>
          </label>
          <span class="voice-toggle-label">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:1rem;height:1rem;opacity:0.7"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 18.93V22h2v-2.07A8.001 8.001 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/></svg>
            Voice Agent
          </span>
        </div>
        <div id="voice-login-status" style="display:none;font-size:0.75rem;color:#1595b2;text-align:center;padding:0.2rem 0">
          <span id="voice-login-status-text"></span>
        </div>
        <div id="login-error" class="login-error" style="display:none"></div>
      </div>`,

  `  <!-- ═══ LOGIN MODAL ═══ -->
  <div id="login-overlay" class="hidden" style="display:none">
    <div class="login-box">
      <!-- Logo -->
      <div class="login-box-logo">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1595b2"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 18.93V22h2v-2.07A8.001 8.001 0 0 0 20 12h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 7.93z"/></svg>
      </div>
      <h2>Welcome back</h2>
      <div class="login-box-subtitle">Sign in to Test 1 2</div>

      <!-- Step 1: USERID + PIN -->
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
      </div>`
);

// ── 3. Auto-show modal when no valid session (add call in initAuth) ────────
h = h.replace(
  `  // No valid session — show Log in link instead of auto-popup
  const hll = document.getElementById('header-login-link');
  if (hll) {
    hll.style.display = '';
    hll.addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
  }`,
  `  // No valid session — show login modal automatically + keep Log in link
  if (typeof showLoginModal === 'function') showLoginModal();
  const hll = document.getElementById('header-login-link');
  if (hll) {
    hll.style.display = '';
    hll.addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
  }`
);

// ── 4. Also update the reveal step hint color (dark text for white card) ──
h = h.replace(
  `<div style="font-size:0.72rem;color:#64748b;margin-bottom:0.25rem">USERNAME</div>
          <div id="reveal-userid" style="font-size:1.2rem;font-weight:800;color:#1595b2;letter-spacing:0.06em;word-break:break-all"></div>
          <div style="font-size:0.72rem;color:#64748b;margin:0.6rem 0 0.25rem">2-DIGIT PASSWORD</div>`,
  `<div style="font-size:0.72rem;color:#6b7280;margin-bottom:0.25rem">USERNAME</div>
          <div id="reveal-userid" style="font-size:1.2rem;font-weight:800;color:#1595b2;letter-spacing:0.06em;word-break:break-all"></div>
          <div style="font-size:0.72rem;color:#6b7280;margin:0.6rem 0 0.25rem">2-DIGIT PASSWORD</div>`
);

fs.writeFileSync('public/index.html', h, 'utf8');
console.log('Done. Verifying...');
const h2 = fs.readFileSync('public/index.html', 'utf8');
console.log('welcome back heading:', h2.includes('Welcome back'));
console.log('auto-show call:', h2.includes('showLoginModal()') && h2.includes('No valid session'));

// Syntax check
const { execSync } = require('child_process');
const scripts = [...h2.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const largest = scripts.reduce((a, b) => a[1].length > b[1].length ? a : b);
fs.writeFileSync('_tmp_check.js', largest[1], 'utf8');
try {
  execSync('node --check _tmp_check.js', { stdio: 'pipe' });
  console.log('✓ JS syntax OK');
} catch(e) {
  console.error('✗ Syntax error:', e.stderr.toString().split('\n')[0]);
}
