const fs = require('fs');
const h = fs.readFileSync('public/index.html', 'utf8');
console.log('login-overlay in DOM:', (h.match(/id="login-overlay"/g)||[]).length);
console.log('const overlay =', (h.match(/const overlay\s*=/g)||[]).length);
console.log('overlay getElementById:', h.includes("getElementById('login-overlay')") || h.includes('getElementById("login-overlay")'));
