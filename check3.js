const fs = require('fs');
const h = fs.readFileSync('public/index.html', 'utf8');
const lines = h.split('\n');
lines.forEach((l, i) => {
  if (l.includes('id="log') || l.includes('connect-btn') || l.includes('voice-panel') || l.includes('va-log') || l.includes('agent-panel') || l.includes('status-bar')) {
    console.log(i+1+':', l.trim().substring(0,100));
  }
});
