const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove display:none from the login link so it shows by default
h = h.replace(
  'id="header-login-link" class="header-login-link" href="#" style="display:none"',
  'id="header-login-link" class="header-login-link" href="#"'
);

// 2. Guard logoutBtn.addEventListener against null (defensive)
h = h.replace(
  '\nlogoutBtn.addEventListener(',
  '\nif (logoutBtn) logoutBtn.addEventListener('
);

fs.writeFileSync('public/index.html', h, 'utf8');
console.log('Done');
const h2 = fs.readFileSync('public/index.html', 'utf8');
const hasVisibleDefault = h2.includes('header-login-link" href="#">Log in');
const hasGuard = h2.includes('if (logoutBtn) logoutBtn.addEventListener');
console.log('login link visible by default:', hasVisibleDefault);
console.log('logoutBtn guarded:', hasGuard);
