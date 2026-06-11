'use strict';
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');
const db = require('./db');
const logger = require('./logger');

let serverlessExpressHandler;
let dbInitialized = false;

// Epic 7 / Story 7.4 — cold-start signal. Module init runs exactly once per
// container, so emitting here counts one ColdStart per cold start. Guarded +
// idempotent so an accidental second call (or a test) never double-counts.
let coldStartReported = false;
function reportColdStart() {
  if (coldStartReported) return;
  coldStartReported = true;
  try { logger.metric('ColdStart', 1, 'Count', { Fn: 'web' }); } catch (_e) { /* fire-and-forget */ }
}
reportColdStart();
exports.reportColdStart = reportColdStart;

exports.handler = async (event, context) => {
  // Only latch `dbInitialized` after a SUCCESSFUL init. Setting the flag
  // before awaiting init() (the previous behaviour) meant any transient
  // RDS / Secrets Manager hiccup on cold start permanently broke that
  // warm container — every subsequent request returned 503 "Database
  // not connected" until the container died of inactivity.
  if (!dbInitialized) {
    const ok = await db.init();
    if (ok) {
      dbInitialized = true;
      console.log('Lambda DB: connected');
    } else {
      // Story 7.4 — surface DB-init failures as a structured log + metric so
      // they're alarmable (7.6), not just buried in plain console output.
      const message = db.getLastError()?.message;
      logger.error('db_init_failed', { fn: 'web', message });
      try { logger.metric('DbInitFailure', 1, 'Count', { Fn: 'web' }); } catch (_e) { /* fire-and-forget */ }
      console.log(`Lambda DB: FAILED — ${message}`);
      // Leave dbInitialized = false so the NEXT request retries init().
    }
  }
  if (!serverlessExpressHandler) {
    serverlessExpressHandler = serverlessExpress({
      app,
      eventSourceName: 'AWS_API_GATEWAY_V2',
      binarySettings: {
        isBinary: ({ headers }) => true,
        contentTypes: ['audio/mpeg', 'audio/webm', 'application/octet-stream']
      }
    });
  }
  return serverlessExpressHandler(event, context);
};
