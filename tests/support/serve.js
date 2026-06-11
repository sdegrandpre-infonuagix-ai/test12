// CLI wrapper around the loopback static server, launched by Playwright's
// `webServer` config so browser specs can hit a real http origin (the SPA
// relies on absolute paths + same-origin fetch, so file:// won't work).
// Serves public/ on a fixed port; stays alive until Playwright tears it down.

const path = require('path');
const { startStaticServer } = require('./static-server');

const PORT = Number(process.env.A11Y_PORT || 5050);

startStaticServer(path.join(__dirname, '..', '..', 'public'), PORT).then((s) => {
  // Playwright waits on the configured url; log for visibility.
  console.log(`[serve] static server listening on ${s.url}`);
});
