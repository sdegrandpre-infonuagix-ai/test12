// Epic 7 / Story 7.5 — X-Ray tracing helper (tracing.js).
//
// tracing.js captures `enabled` from the environment at require time, so each
// scenario re-requires it fresh (clearing the module cache and controlling the
// env) — robust against Playwright worker reuse. aws-xray-sdk-core is NOT
// installed here, which is exactly the point: even when "enabled", load() must
// catch the missing package and every entry point must degrade to a safe
// passthrough. Tracing must never break the app.

const { test, expect } = require('@playwright/test');

const TRACING = require.resolve('../tracing');
const TRACE_KEYS = ['AWS_LAMBDA_FUNCTION_NAME', 'XRAY_ENABLED'];

// Re-require tracing.js with a controlled env, then restore the env and cache.
function freshRequire(env = {}) {
  const saved = Object.fromEntries(TRACE_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of TRACE_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    delete require.cache[TRACING];
    return require('../tracing');
  } finally {
    for (const k of TRACE_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete require.cache[TRACING];
  }
}

const fakeClient = () => ({ send: () => 'ok', marker: Symbol('client') });

test.describe('Story 7.5 — tracing helper', () => {
  test('disabled when not in Lambda and XRAY_ENABLED is unset', () => {
    const t = freshRequire({});
    expect(t.enabled).toBe(false);
    const c = fakeClient();
    expect(t.captureClient(c)).toBe(c); // passthrough
  });

  test('enabled in Lambda (AWS_LAMBDA_FUNCTION_NAME present)', () => {
    const t = freshRequire({ AWS_LAMBDA_FUNCTION_NAME: 'test12' });
    expect(t.enabled).toBe(true);
  });

  test('enabled via XRAY_ENABLED=1', () => {
    const t = freshRequire({ XRAY_ENABLED: '1' });
    expect(t.enabled).toBe(true);
  });

  test('enabled but SDK absent → load fails gracefully, captureClient passes through', () => {
    const t = freshRequire({ XRAY_ENABLED: '1' });
    const c = fakeClient();
    // aws-xray-sdk-core isn't installed; require/init must not throw and the
    // client must come back untouched.
    expect(() => t.captureClient(c)).not.toThrow();
    expect(t.captureClient(c)).toBe(c);
  });

  test('captureClient tolerates odd inputs', () => {
    const t = freshRequire({});
    expect(() => t.captureClient(null)).not.toThrow();
    expect(t.captureClient(null)).toBe(null);
  });
});
