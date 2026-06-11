'use strict';

// ═══════════════════════════════════════════════════════════════════
//  Epic 7 / Story 7.1 — CloudWatch observability foundation.
//
//  Zero runtime dependencies. Everything is written to stdout as single-line
//  JSON:
//    • structured logs  → CloudWatch Logs (queryable in Logs Insights)
//    • EMF metric blobs → CloudWatch auto-extracts custom metrics, with NO
//      PutMetricData call, NO extra IAM, and NO request-path network latency
//      (so it is inherently fire-and-forget — honours NFR6).
//
//  In Lambda, stdout already streams to CloudWatch Logs and the EMF agent in
//  the runtime parses the `_aws` blobs. Locally (web.js / dev.js) the same
//  lines are just readable JSON — harmless, no daemon required.
//
//  Shared by app.js, lambda.js, mcp-*.js, ws-handler.js. Pure builders
//  (`build.log`, `build.metric`) are exported for unit tests; all emission
//  flows through one swappable sink (`__setSink`).
// ═══════════════════════════════════════════════════════════════════

const NAMESPACE = process.env.CW_NAMESPACE || 'Test12/App';
const SERVICE = process.env.CW_SERVICE || 'test12';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let minLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

// Single emission point. process.stdout.write keeps one JSON object per line
// (console.log would also work, but this avoids any future formatter coupling).
let sink = (line) => process.stdout.write(line + '\n');

// Replace the sink (tests capture output). Returns a restore() to put it back.
function __setSink(fn) {
  const prev = sink;
  sink = fn;
  return () => { sink = prev; };
}

function setLevel(level) {
  const lvl = LEVELS[String(level).toLowerCase()];
  if (lvl) minLevel = lvl;
}

// JSON.stringify that never throws — circular refs / bad values must not take
// down the request path just because we tried to log them.
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (_e) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      if (typeof v === 'bigint') return v.toString();
      return v;
    });
  }
}

// ── Structured logs ──────────────────────────────────────────────────

function buildLog(level, msg, fields = {}) {
  // fields first so the canonical keys below always win.
  return {
    ...fields,
    level,
    msg,
    service: SERVICE,
    ts: new Date().toISOString(),
  };
}

function log(level, msg, fields) {
  if ((LEVELS[level] || 0) < minLevel) return;
  sink(safeStringify(buildLog(level, msg, fields)));
}

// ── EMF metrics ──────────────────────────────────────────────────────

// Build an Embedded Metric Format record. `dimensions` is a flat string map;
// its keys become the (single) dimension set and its values are promoted to
// top-level fields, as the EMF spec requires. `extraFields` ride along as plain
// log fields (visible in Logs Insights) WITHOUT joining the dimension set —
// the place to put high-cardinality context like requestId.
function buildMetric(name, value = 1, unit = 'Count', dimensions = {}, extraFields = {}, namespace = NAMESPACE) {
  const dimKeys = Object.keys(dimensions);
  return {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          // A single dimension set. Empty ([[]]) publishes the metric with no
          // dimensions; CloudWatch treats [] (no sets) as "drop the metric".
          Dimensions: [dimKeys],
          Metrics: [{ Name: name, Unit: unit }],
        },
      ],
    },
    service: SERVICE,
    ...extraFields,
    ...dimensions,
    [name]: value,
  };
}

function metric(name, value, unit, dimensions, extraFields, namespace) {
  sink(safeStringify(buildMetric(name, value, unit, dimensions, extraFields, namespace)));
}

module.exports = {
  // structured logs
  debug: (msg, fields) => log('debug', msg, fields),
  info: (msg, fields) => log('info', msg, fields),
  warn: (msg, fields) => log('warn', msg, fields),
  error: (msg, fields) => log('error', msg, fields),
  // metrics
  metric,
  // config
  setLevel,
  NAMESPACE,
  SERVICE,
  // testing / advanced
  build: { log: buildLog, metric: buildMetric },
  __setSink,
};
