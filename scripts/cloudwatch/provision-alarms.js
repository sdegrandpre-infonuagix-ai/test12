'use strict';

// ═══════════════════════════════════════════════════════════════════
//  Epic 7 / Story 7.6 — CloudWatch alarms → SNS (deploy-time provisioning).
//
//  Run from deploy.ps1 (`node scripts/cloudwatch/provision-alarms.js`) after the
//  Lambdas are deployed. Idempotent: CreateTopic + PutMetricAlarm both upsert.
//
//  buildAlarmSpecs(env) is a PURE function (unit-tested) returning the exact
//  PutMetricAlarm inputs; main() is the thin IO wrapper. AWS SDK clients are
//  lazy-required inside main() so the builder is testable with no SDK install
//  and no AWS calls.
//
//  Alarm design note — EMF metrics emitted WITH dimensions publish one stream
//  per dimension-set, and CloudWatch can't alarm on them in aggregate. So:
//    • Lambda built-ins (Errors/Throttles/Duration) → simple alarms, single
//      FunctionName dimension, always present.
//    • DbInitFailure (single Fn dim) → simple alarm.
//    • ErrorCount (multi-dim) → metric-math SEARCH() that sums every stream.
//  Subscriptions to the SNS topic (email/SMS) are left to the operator.
// ═══════════════════════════════════════════════════════════════════

const DEFAULTS = {
  region: process.env.AWS_REGION || 'us-east-1',
  functionName: 'test12',
  appNamespace: process.env.CW_NAMESPACE || 'Test12/App',
  voiceModeNamespace: process.env.CW_VOICEMODE_NAMESPACE || 'Test12/VoiceMode',
  alertTopicName: 'test12-alerts',
};

function buildAlarmSpecs(env = {}) {
  const cfg = { ...DEFAULTS, ...env };
  const { functionName, appNamespace } = cfg;
  const actions = cfg.snsTopicArn ? [cfg.snsTopicArn] : [];
  const fnDim = [{ Name: 'FunctionName', Value: functionName }];

  const base = {
    EvaluationPeriods: 1,
    Period: 300,
    TreatMissingData: 'notBreaching',
    ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    ActionsEnabled: true,
    AlarmActions: actions,
  };

  return [
    {
      ...base,
      AlarmName: `${functionName}-lambda-errors`,
      AlarmDescription: 'Lambda unhandled errors ≥ 5 in 5 minutes.',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Dimensions: fnDim,
      Statistic: 'Sum',
      Threshold: 5,
    },
    {
      ...base,
      AlarmName: `${functionName}-lambda-throttles`,
      AlarmDescription: 'Lambda throttles ≥ 1 in 5 minutes (concurrency limit pressure).',
      Namespace: 'AWS/Lambda',
      MetricName: 'Throttles',
      Dimensions: fnDim,
      Statistic: 'Sum',
      Threshold: 1,
    },
    {
      ...base,
      AlarmName: `${functionName}-lambda-duration-p95`,
      AlarmDescription: 'Lambda p95 duration ≥ 3000 ms sustained over 15 minutes.',
      Namespace: 'AWS/Lambda',
      MetricName: 'Duration',
      Dimensions: fnDim,
      ExtendedStatistic: 'p95',
      Threshold: 3000,
      EvaluationPeriods: 3,
    },
    {
      ...base,
      AlarmName: `${functionName}-db-init-failure`,
      AlarmDescription: 'Database initialization failed at least once in 5 minutes.',
      Namespace: appNamespace,
      MetricName: 'DbInitFailure',
      Dimensions: [{ Name: 'Fn', Value: 'web' }],
      Statistic: 'Sum',
      Threshold: 1,
    },
    {
      ...base,
      AlarmName: `${functionName}-app-errors`,
      AlarmDescription: 'Total application ErrorCount (all routes/classes) ≥ 10 in 5 minutes.',
      Threshold: 10,
      // Metric-math: sum every ErrorCount dimension-stream into one series.
      Metrics: [
        {
          Id: 'errStreams',
          Expression: `SEARCH('{${appNamespace},ErrorClass,Route} MetricName="ErrorCount"', 'Sum', 300)`,
          ReturnData: false,
        },
        {
          Id: 'errTotal',
          Expression: 'SUM(errStreams)',
          Label: 'ErrorCount (all)',
          ReturnData: true,
        },
      ],
    },
  ];
}

async function ensureTopic(sns, name) {
  const { CreateTopicCommand } = require('@aws-sdk/client-sns');
  const res = await sns.send(new CreateTopicCommand({ Name: name })); // idempotent
  return res.TopicArn;
}

async function main() {
  const cfg = { ...DEFAULTS, region: process.env.AWS_REGION || DEFAULTS.region };
  const { CloudWatchClient, PutMetricAlarmCommand } = require('@aws-sdk/client-cloudwatch');
  const { SNSClient } = require('@aws-sdk/client-sns');

  const sns = new SNSClient({ region: cfg.region });
  const cw = new CloudWatchClient({ region: cfg.region });

  const snsTopicArn = await ensureTopic(sns, cfg.alertTopicName);
  console.log(`SNS alert topic: ${snsTopicArn}`);

  const specs = buildAlarmSpecs({ ...cfg, snsTopicArn });
  for (const spec of specs) {
    await cw.send(new PutMetricAlarmCommand(spec));
    console.log(`  alarm upserted: ${spec.AlarmName}`);
  }
  console.log(`Provisioned ${specs.length} CloudWatch alarms → ${cfg.alertTopicName}.`);
  console.log('Reminder: subscribe an endpoint (email/SMS) to the topic to receive alerts.');
}

if (require.main === module) {
  main().catch((e) => { console.error('provision-alarms failed:', e.message); process.exit(1); });
}

module.exports = { buildAlarmSpecs, DEFAULTS };
