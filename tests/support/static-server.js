// Minimal static file server used by the a11y audit harness
// (tests/a11y-audit.test.js). The SPA relies on absolute paths
// (`/dist/tailwind.css`, `/manifest.json`) and same-origin fetch, so a
// `file://` load would break it — we serve `public/` over loopback HTTP
// instead. Throwaway: no caching, no directory listing, no deps.

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Start a static server rooted at `root`. Resolves to { url, close() }.
function startStaticServer(root, port = 0) {
  const rootAbs = path.resolve(root);
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
        const filePath = path.join(rootAbs, rel);
        // Path-traversal guard
        if (!filePath.startsWith(rootAbs)) {
          res.writeHead(403);
          return res.end('forbidden');
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          return res.end('not found');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { startStaticServer };
