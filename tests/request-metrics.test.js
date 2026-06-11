// Epic 7 / Story 7.2 — request logging + latency/count metrics middleware.
//
// Boots the real Express app (app.js) on an ephemeral port in-process and makes
// HTTP requests, asserting the middleware emits per request:
//   • one structured `request` access log (method, route, status, durationMs,
//     requestId)
//   • EMF RequestCount (dims Route, Method, Status)
//   • EMF LatencyMs (dim Route)
// Route labels stay low-cardinality: matched routes use the express path
// pattern; everything else collapses to 'unmatched'.
//
// Pure-node spec (no browser). Output is captured via logger.__setSink — app.js
// and this file share the same cached logger instance, so the swap is visible
// to the middleware.

const http = require('http');
const { test, expect } = require('@playwright/test');

const logger = require('../logger');
const app = require('../app');

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function httpRequest(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      res.resume(); // drain so 'finish' fires and the socket frees
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

// Run one request with the sink captured; return the parsed JSON lines emitted
// during it. Polls until the res 'finish' handler has flushed (it runs just
// after the client sees the response end).
async function captureRequest(port, path, method = 'GET') {
  const lines = [];
  const restore = logger.__setSink((l) => lines.push(l));
  try {
    await httpRequest(port, path, method);
    await expect.poll(() => lines.length, { timeout: 2000 }).toBeGreaterThanOrEqual(3);
  } finally {
    restore();
  }
  return lines.map((l) => JSON.parse(l));
}

test.describe('Story 7.2 — request observability middleware', () => {
  let server, port;

  test.beforeAll(async () => {
    ({ server, port } = await startServer());
  });

  test.afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  test('matched route emits access log + RequestCount + LatencyMs with the route pattern', async () => {
    const recs = await captureRequest(port, '/api/config/client');

    const accessLog = recs.find((r) => r.msg === 'request');
    const count = recs.find((r) => r.RequestCount !== undefined);
    const latency = recs.find((r) => r.LatencyMs !== undefined);

    // Access log.
    expect(accessLog).toBeTruthy();
    expect(accessLog.method).toBe('GET');
    expect(accessLog.route).toBe('/api/config/client');
    expect(accessLog.status).toBe('200');
    expect(typeof accessLog.durationMs).toBe('number');
    expect(typeof accessLog.requestId).toBe('string');
    expect(accessLog.requestId.length).toBeGreaterThan(0);

    // RequestCount EMF with the full dimension set.
    expect(count.RequestCount).toBe(1);
    expect(count._aws.CloudWatchMetrics[0].Dimensions).toEqual([['Route', 'Method', 'Status']]);
    expect(count.Route).toBe('/api/config/client');
    expect(count.Method).toBe('GET');
    expect(count.Status).toBe('200');

    // LatencyMs EMF dimensioned by Route only.
    expect(typeof latency.LatencyMs).toBe('number');
    expect(latency.LatencyMs).toBeGreaterThanOrEqual(0);
    expect(latency._aws.CloudWatchMetrics[0].Dimensions).toEqual([['Route']]);
    expect(latency.Route).toBe('/api/config/client');
  });

  test('unknown GET hits the SPA catch-all → route="*" (bounded, not the raw URL)', async () => {
    const recs = await captureRequest(port, '/some/deep/unknown/path');
    const accessLog = recs.find((r) => r.msg === 'request');
    // The express catch-all (app.get('*')) serves index.html; the label is the
    // route pattern '*', never the raw high-cardinality URL.
    expect(accessLog.route).toBe('*');
    expect(accessLog.status).toBe('200');
  });

  test('unmatched method/path collapses to route="unmatched" with status 404', async () => {
    // POST to an unknown path: static + the GET-only catch-all don't match, so
    // no route is set → the genuine 'unmatched' branch, Express default 404.
    const recs = await captureRequest(port, '/api/__definitely_not_a_route__', 'POST');

    const accessLog = recs.find((r) => r.msg === 'request');
    const count = recs.find((r) => r.RequestCount !== undefined);

    expect(accessLog.route).toBe('unmatched');
    expect(accessLog.status).toBe('404');
    expect(count.Route).toBe('unmatched');
    expect(count.Method).toBe('POST');
    expect(count.Status).toBe('404');
  });

  test('each request gets a distinct requestId', async () => {
    const a = (await captureRequest(port, '/api/config/client')).find((r) => r.msg === 'request');
    const b = (await captureRequest(port, '/api/config/client')).find((r) => r.msg === 'request');
    expect(a.requestId).not.toBe(b.requestId);
  });
});
