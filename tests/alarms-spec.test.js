// Epic 7 / Story 7.6 — CloudWatch alarm specs (pure builder).
//
// Unit-tests buildAlarmSpecs(env) — the pure function that produces the
// PutMetricAlarm inputs. The provisioning IO (SNS topic + PutMetricAlarm calls)
// lives in main() and is exercised at deploy, not here. AWS SDK is lazy-required
// in main(), so requiring this module needs no SDK install.

const { test, expect } = require('@playwright/test');

const { buildAlarmSpecs } = require('../scripts/cloudwatch/provision-alarms');

const ENV = {
  functionName: 'test12',
  snsTopicArn: 'arn:aws:sns:us-east-1:123456789012:test12-alerts',
  appNamespace: 'Test12/App',
  voiceModeNamespace: 'Test12/VoiceMode',
};

test.describe('Story 7.6 — alarm specs', () => {
  const specs = buildAlarmSpecs(ENV);
  const byName = Object.fromEntries(specs.map((s) => [s.AlarmName, s]));

  test('produces the expected named alarms', () => {
    expect(specs.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(byName)).toEqual(
      expect.arrayContaining([
        'test12-lambda-errors',
        'test12-lambda-throttles',
        'test12-lambda-duration-p95',
        'test12-db-init-failure',
        'test12-app-errors',
      ])
    );
  });

  test('every alarm routes to the SNS topic and treats missing data as not-breaching', () => {
    for (const s of specs) {
      expect(s.AlarmActions).toEqual([ENV.snsTopicArn]);
      expect(s.TreatMissingData).toBe('notBreaching');
      expect(s.ComparisonOperator).toMatch(/GreaterThan/);
    }
  });

  test('Lambda built-in alarms use AWS/Lambda with the FunctionName dimension', () => {
    const errors = byName['test12-lambda-errors'];
    expect(errors.Namespace).toBe('AWS/Lambda');
    expect(errors.MetricName).toBe('Errors');
    expect(errors.Statistic).toBe('Sum');
    expect(errors.Dimensions).toEqual([{ Name: 'FunctionName', Value: 'test12' }]);

    expect(byName['test12-lambda-throttles'].MetricName).toBe('Throttles');

    const dur = byName['test12-lambda-duration-p95'];
    expect(dur.MetricName).toBe('Duration');
    expect(dur.ExtendedStatistic).toBe('p95'); // percentile, not Statistic
    expect(dur.Statistic).toBeUndefined();
  });

  test('db-init-failure alarms on the single-dimension DbInitFailure metric', () => {
    const a = byName['test12-db-init-failure'];
    expect(a.Namespace).toBe('Test12/App');
    expect(a.MetricName).toBe('DbInitFailure');
    expect(a.Dimensions).toEqual([{ Name: 'Fn', Value: 'web' }]);
    expect(a.Threshold).toBe(1);
  });

  test('app-errors aggregates ErrorCount across dimensions via a metric-math SEARCH', () => {
    const a = byName['test12-app-errors'];
    // Dimensioned EMF metrics can't be alarmed in aggregate directly, so this
    // one uses a Metrics[] math expression, not a flat Namespace/MetricName.
    expect(a.Namespace).toBeUndefined();
    expect(a.MetricName).toBeUndefined();
    expect(Array.isArray(a.Metrics)).toBe(true);
    const search = a.Metrics.find((m) => m.Expression && m.Expression.includes('SEARCH'));
    expect(search).toBeTruthy();
    expect(search.Expression).toContain('Test12/App');
    expect(search.Expression).toContain('ErrorCount');
    // Exactly one returned (alarmable) datapoint series.
    const returned = a.Metrics.filter((m) => m.ReturnData !== false);
    expect(returned).toHaveLength(1);
  });

  test('omitting snsTopicArn yields no alarm actions (safe dry spec)', () => {
    const dry = buildAlarmSpecs({ functionName: 'test12' });
    for (const s of dry) expect(s.AlarmActions).toEqual([]);
  });
});
