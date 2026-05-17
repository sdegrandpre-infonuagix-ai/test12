'use strict';
const serverlessExpress = require('@vendia/serverless-express');
const app = require('./app');
const db = require('./db');

let serverlessExpressHandler;
let dbInitialized = false;

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
      console.log(`Lambda DB: FAILED — ${db.getLastError()?.message}`);
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
