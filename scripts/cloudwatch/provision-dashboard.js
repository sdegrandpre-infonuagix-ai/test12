'use strict';

// ═══════════════════════════════════════════════════════════════════
//  Epic 7 / Story 7.7 — Operator CloudWatch dashboard (deploy-time).
//
//  Run from deploy.ps1 (`node scripts/cloudwatch/provision-dashboard.js`).
//  Idempotent: PutDashboard upserts by name.
//
//  buildDashboardBody(env) is PURE (unit-tested) and returns the DashboardBody
//  object; main() JSON-stringifies it and calls PutDashboard (SDK lazy-required,
//  so the builder tests with no SDK install / no AWS calls).
//
//  Dimensioned EMF metrics (RequestCount, ErrorCount, ModeSwitch, …) publish one
//  stream per dimension-set, so aggregate widgets use metric-math SEARCH() to
//  roll them up — same reason the alarms (7.6) do.
// ═══════════════════════════════════════════════════════════════════

const DEFAULTS = {
  region: process.env.AWS_REGION || 'us-east-1',
  functionName: 'test12',
  appNamespace: process.env.CW_NAMESPACE || 'Test12/App',
  voiceModeNamespace: process.env.CW_VOICEMODE_NAMESPACE || 'Test12/VoiceMode',
  dashboardName: 'test12-observability',
};

const FULL = 24; // CloudWatch dashboards are a 24-column grid.

function widget({ title, region, metrics, x, y, width = 12, height = 6, stat = 'Sum', period = 300, view = 'timeSeries' }) {
  return { type: 'metric', x, y, width, height, properties: { title, region, view, stat, period, metrics } };
}

function buildDashboardBody(env = {}) {
  const cfg = { ...DEFAULTS, ...env };
  const { region, functionName: fn, appNamespace: app, voiceModeNamespace: vm } = cfg;
  const widgets = [];
  let y = 0;

  // Row 1 — request throughput + p95/avg latency.
  widgets.push(widget({
    title: 'Request rate (all routes)', region, x: 0, y, width: 12, stat: 'Sum',
    metrics: [[{ expression: `SUM(SEARCH('{${app},Route,Method,Status} MetricName="RequestCount"', 'Sum', 300))`, label: 'Requests', id: 'reqs' }]],
  }));
  widgets.push(widget({
    title: 'Lambda latency (avg / p95)', region, x: 12, y, width: 12, stat: 'Average',
    metrics: [
      ['AWS/Lambda', 'Duration', 'FunctionName', fn, { stat: 'Average', label: 'avg ms' }],
      ['AWS/Lambda', 'Duration', 'FunctionName', fn, { stat: 'p95', label: 'p95 ms' }],
    ],
  }));
  y += 6;

  // Row 2 — application errors + Lambda errors/throttles.
  widgets.push(widget({
    title: 'Application errors (ErrorCount, all classes)', region, x: 0, y, width: 12, stat: 'Sum',
    metrics: [[{ expression: `SUM(SEARCH('{${app},ErrorClass,Route} MetricName="ErrorCount"', 'Sum', 300))`, label: 'Errors', id: 'errs' }]],
  }));
  widgets.push(widget({
    title: 'Lambda errors & throttles', region, x: 12, y, width: 12, stat: 'Sum',
    metrics: [
      ['AWS/Lambda', 'Errors', 'FunctionName', fn, { stat: 'Sum', label: 'errors' }],
      ['AWS/Lambda', 'Throttles', 'FunctionName', fn, { stat: 'Sum', label: 'throttles' }],
    ],
  }));
  y += 6;

  // Row 3 — voice-mode bake-off: switch outcomes + realtime session duration.
  widgets.push(widget({
    title: 'Mode switches by outcome', region, x: 0, y, width: 12, stat: 'Sum',
    metrics: [[{ expression: `SEARCH('{${vm},ModeFrom,ModeTo,Source,Outcome} MetricName="ModeSwitch"', 'Sum', 300)`, label: 'ModeSwitch', id: 'ms' }]],
  }));
  widgets.push(widget({
    title: 'Realtime session duration (p95 by mode)', region, x: 12, y, width: 12, stat: 'p95',
    metrics: [[{ expression: `SEARCH('{${vm},Mode} MetricName="RealtimeSessionDurationMs"', 'p95', 300)`, label: 'RealtimeSessionDurationMs', id: 'rt' }]],
  }));
  y += 6;

  // Row 4 — Lambda capacity: invocations + concurrency.
  widgets.push(widget({
    title: 'Lambda invocations & concurrency', region, x: 0, y, width: FULL, height: 6, stat: 'Sum',
    metrics: [
      ['AWS/Lambda', 'Invocations', 'FunctionName', fn, { stat: 'Sum', label: 'invocations' }],
      ['AWS/Lambda', 'ConcurrentExecutions', 'FunctionName', fn, { stat: 'Maximum', label: 'max concurrency' }],
    ],
  }));
  y += 6;

  return { widgets };
}

async function main() {
  const cfg = { ...DEFAULTS, region: process.env.AWS_REGION || DEFAULTS.region };
  const { CloudWatchClient, PutDashboardCommand } = require('@aws-sdk/client-cloudwatch');
  const cw = new CloudWatchClient({ region: cfg.region });

  const body = buildDashboardBody(cfg);
  await cw.send(new PutDashboardCommand({
    DashboardName: cfg.dashboardName,
    DashboardBody: JSON.stringify(body),
  }));
  console.log(`Dashboard upserted: ${cfg.dashboardName} (${body.widgets.length} widgets) in ${cfg.region}.`);
  console.log(`  https://${cfg.region}.console.aws.amazon.com/cloudwatch/home?region=${cfg.region}#dashboards:name=${cfg.dashboardName}`);
}

if (require.main === module) {
  main().catch((e) => { console.error('provision-dashboard failed:', e.message); process.exit(1); });
}

module.exports = { buildDashboardBody, DEFAULTS };
