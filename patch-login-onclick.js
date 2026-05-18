const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// Add onclick directly on the element so it works regardless of initAuth
h = h.replace(
  'id="header-login-link" class="header-login-link" href="#">Log in</a>',
  'id="header-login-link" class="header-login-link" href="#" onclick="event.preventDefault();showLoginModal();">Log in</a>'
);

fs.writeFileSync('public/index.html', h, 'utf8');
const ok = fs.readFileSync('public/index.html','utf8').includes('onclick="event.preventDefault();showLoginModal();"');
console.log('onclick wired:', ok);
