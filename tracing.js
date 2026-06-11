'use strict';

// ═══════════════════════════════════════════════════════════════════
//  Epic 7 / Story 7.5 — AWS X-Ray tracing (opt-in, Lambda-only by default).
//
//  Lazy + fully guarded. aws-xray-sdk-core is required ONLY when tracing is
//  enabled (running in Lambda, or XRAY_ENABLED=1), so local/dev/test runs need
//  neither the package nor the X-Ray daemon — and if the package or daemon is
//  absent even when "enabled", every entry point degrades to a passthrough
//  instead of throwing. Tracing must never break the request path.
//
//  • captureClient(client) — wrap an AWS SDK v3 client for tracing (DynamoDB,
//    SNS, SES, …); returns it untouched when disabled/unavailable.
//  • Outbound HTTP(S) is captured globally on init, tracing node-fetch calls to
//    the xAI / OpenAI / Anthropic APIs.
// ═══════════════════════════════════════════════════════════════════

const enabled = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.XRAY_ENABLED === '1');

let xray = null;
let loaded = false;

function load() {
  if (loaded) return xray;
  loaded = true;
  try {
    const x = require('aws-xray-sdk-core');
    // Don't throw if a segment is missing — log instead (keeps the request alive).
    x.setContextMissingStrategy('LOG_ERROR');
    // Trace outbound HTTP(S): node-fetch uses the global http/https agents, so
    // this covers the external AI provider calls.
    x.captureHTTPsGlobal(require('https'));
    x.captureHTTPsGlobal(require('http'));
    xray = x;
  } catch (_e) {
    xray = null; // package missing / init failed → passthrough everywhere
  }
  return xray;
}

if (enabled) load();

function captureClient(client) {
  if (!enabled) return client;
  const x = load();
  if (!x) return client;
  try { return x.captureAWSv3Client(client); } catch (_e) { return client; }
}

module.exports = { enabled, captureClient };
