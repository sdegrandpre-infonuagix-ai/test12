/**
 * dev.js — Local UI dev server
 *
 * Serves public/ on http://localhost:3000
 * Proxies /api/* → https://test12.net/api/*
 *
 * Usage:  node dev.js
 */
'use strict';

const express  = require('express');
const fetch    = require('node-fetch');
const path     = require('path');
const https    = require('https');

const PORT        = process.env.DEV_PORT || 3000;
const PROD_ORIGIN = process.env.PROD_ORIGIN || 'https://test12.net';

const app = express();

// ── Proxy /api/* → prod ──────────────────────────────────────────────────────
app.all('/api/*', async (req, res) => {
  const targetUrl = `${PROD_ORIGIN}${req.url}`;
  try {
    // Collect raw body bytes so we don't lose binary payloads
    const chunks = [];
    req.on('data', c => chunks.push(c));
    await new Promise(resolve => req.on('end', resolve));
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = { ...req.headers };
    // Rewrite Host so prod Lambda accepts it
    headers['host'] = new URL(PROD_ORIGIN).host;
    // Remove encoding headers that would mangle the proxied response
    delete headers['accept-encoding'];

    const upstream = await fetch(targetUrl, {
      method:  req.method,
      headers,
      body:    ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      // Follow redirects
      redirect: 'follow',
      agent: new https.Agent({ keepAlive: true }),
    });

    // Forward status + headers
    res.status(upstream.status);
    upstream.headers.forEach((val, key) => {
      // Skip transfer-encoding — Express handles that
      if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, val);
    });

    upstream.body.pipe(res);
  } catch (err) {
    console.error(`[proxy] ${req.method} ${req.url} →`, err.message);
    res.status(502).json({ error: 'Proxy error', details: err.message });
  }
});

// ── Also proxy /manifest.json and icons if missing locally ───────────────────
// (public/ already has these, so they're served statically below — this is just a fallback)

// ── Serve public/ ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback → index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('\n🚀  Dev server running');
  console.log(`   UI  →  http://localhost:${PORT}`);
  console.log(`   API →  ${PROD_ORIGIN}  (proxied)\n`);
});
