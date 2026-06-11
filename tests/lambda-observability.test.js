// Epic 7 / Story 7.4 — Lambda cold-start instrumentation.
//
// lambda.js reports a ColdStart metric exactly once per container (at module
// load — module init runs once per cold start). This spec sets the sink BEFORE
// requiring lambda.js so it captures that first emission, then proves the
// guard makes a second call a no-op.
//
// Pure-node spec. This is the only test file that requires ../lambda, so the
// require cache is clean in its worker.

const { test, expect } = require('@playwright/test');

const logger = require('../logger');

test('ColdStart is emitted once at module load and is idempotent thereafter', () => {
  const lines = [];
  const restore = logger.__setSink((l) => lines.push(l));
  let lambda;
  try {
    lambda = require('../lambda'); // module init → reportColdStart()
    // Guarded: a second explicit call must not emit again.
    lambda.reportColdStart();
  } finally {
    restore();
  }

  const cold = lines.map((l) => JSON.parse(l)).filter((r) => r.ColdStart !== undefined);
  expect(cold).toHaveLength(1);
  expect(cold[0].ColdStart).toBe(1);
  expect(cold[0].Fn).toBe('web');
});
