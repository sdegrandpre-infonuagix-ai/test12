// Epic 7 / Story 7.4 — central error handler observability.
//
// Drives the real Express app and forces an error through the body parser
// (malformed JSON), which Express forwards to the 4-arg error handler. Asserts
// the handler emits a structured error log + EMF ErrorCount (dims ErrorClass,
// Route) and still returns a sane response.
//
// Pure-node spec. logger.__setSink captures output (shared cached instance).

const http = require('http');
const { test, expect } = require('@playwright/test');

const logger = require('../logger');
const app = require('../app');

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// POST a raw body with an explicit content-type; resolves with the status code.
function post(port, path, body, contentType) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': contentType, 'content-length': data.length } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
    );
    req.on('error', reject);
    req.end(data);
  });
}

test.describe('Story 7.4 — central error handler', () => {
  let server, port;
  test.beforeAll(async () => { ({ server, port } = await startServer()); });
  test.afterAll(async () => { await new Promise((r) => server.close(r)); });

  test('malformed JSON triggers a structured error log + ErrorCount EMF', async () => {
    const lines = [];
    const restore = logger.__setSink((l) => lines.push(l));
    let status;
    try {
      status = await post(port, '/api/auth/auto-register', '{ this is : not json ', 'application/json');
      await expect.poll(() => lines.some((l) => JSON.parse(l).ErrorCount !== undefined), { timeout: 2000 }).toBe(true);
    } finally {
      restore();
    }
    const recs = lines.map((l) => JSON.parse(l));

    // Structured error log.
    const errLog = recs.find((r) => r.msg === 'request_error');
    expect(errLog).toBeTruthy();
    expect(errLog.level).toBe('error');
    expect(errLog.errorClass).toBe('SyntaxError');
    expect(errLog.status).toBe(400);
    expect(typeof errLog.stack).toBe('string');

    // ErrorCount EMF dimensioned by ErrorClass + Route.
    const errMetric = recs.find((r) => r.ErrorCount !== undefined);
    expect(errMetric.ErrorCount).toBe(1);
    expect(errMetric._aws.CloudWatchMetrics[0].Dimensions).toEqual([['ErrorClass', 'Route']]);
    expect(errMetric.ErrorClass).toBe('SyntaxError');

    // Client still gets a clean 4xx (parse error → 400), not a hang.
    expect(status).toBe(400);
  });

  test('a well-formed request emits no ErrorCount', async () => {
    const lines = [];
    const restore = logger.__setSink((l) => lines.push(l));
    try {
      await new Promise((resolve, reject) => {
        const r = http.get({ host: '127.0.0.1', port, path: '/api/config/client' }, (res) => { res.resume(); res.on('end', resolve); });
        r.on('error', reject);
      });
      await expect.poll(() => lines.some((l) => JSON.parse(l).msg === 'request'), { timeout: 2000 }).toBe(true);
    } finally {
      restore();
    }
    expect(lines.map((l) => JSON.parse(l)).some((r) => r.ErrorCount !== undefined)).toBe(false);
  });
});
