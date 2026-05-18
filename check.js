const fs = require('fs');
const h = fs.readFileSync('public/index.html', 'utf8');
const hasLogoutDom = h.includes('id="logout-btn"');
const hasLogoutJs = h.includes('logoutBtn.addEventListener');
const hasProfileBadgeDom = h.includes('id="profile-badge"');
const hasLoginLinkDom = h.includes('id="header-login-link"');
const hasConnectBtnDom = h.includes('id="connect-btn"');
console.log('logout-btn in DOM:', hasLogoutDom);
console.log('logoutBtn.addEventListener in JS:', hasLogoutJs);
console.log('profile-badge in DOM:', hasProfileBadgeDom);
console.log('header-login-link in DOM:', hasLoginLinkDom);
console.log('connect-btn in DOM:', hasConnectBtnDom);
// Check for null-call crash risk
if (!hasLogoutDom && hasLogoutJs) console.log('⚠️ CRASH RISK: logoutBtn is null but addEventListener called on it!');
