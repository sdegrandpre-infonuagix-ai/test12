// Epic 7 / Story 7.1 — structured logger + EMF metric emitter foundation.
//
// Pure-node spec (no browser) — runs under @playwright/test like
// class-coverage.test.js. Verifies the *shape* of what logger.js emits:
//   • structured JSON log records (ts/level/msg/service + fields), level-gated
//   • valid EMF (Embedded Metric Format) metric blobs that CloudWatch can
//     auto-extract — _aws envelope, value at top level, dimensions as fields
// Live CloudWatch delivery is a manual post-deploy check (see the epic runbook).

const { test, expect } = require('@playwright/test');

// Force a deterministic namespace/level BEFORE requiring the module (it reads
// env at load). Worker processes are isolated, so this is safe.
process.env.CW_NAMESPACE = 'Test12/UnitTest';
process.env.CW_SERVICE = 'test12-spec';
process.env.LOG_LEVEL = 'debug';

const logger = require('../logger');

test.describe('Story 7.1 — logger.js structured logs', () => {
  test('build.log produces a structured record with ts/level/msg/service + fields', () => {
    const rec = logger.build.log('info', 'hello', { route: '/api/x', userId: 'u1' });
    expect(rec.level).toBe('info');
    expect(rec.msg).toBe('hello');
    expect(rec.service).toBe('test12-spec');
    expect(rec.route).toBe('/api/x');
    expect(rec.userId).toBe('u1');
    // ISO-8601 timestamp for Logs Insights.
    expect(typeof rec.ts).toBe('string');
    expect(new Date(rec.ts).toISOString()).toBe(rec.ts);
  });

  test('emitting writes exactly one single-line JSON record to the sink', () => {
    const lines = [];
    const restore = logger.__setSink((l) => lines.push(l));
    try {
      logger.info('one', { a: 1 });
    } finally {
      restore();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0].includes('\n')).toBe(false);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ level: 'info', msg: 'one', a: 1 });
  });

  test('LOG_LEVEL gates lower-severity records', () => {
    const lines = [];
    const restore = logger.__setSink((l) => lines.push(l));
    try {
      logger.setLevel('warn');
      logger.info('suppressed');
      logger.debug('also-suppressed');
      logger.warn('kept');
      logger.error('kept-too');
    } finally {
      logger.setLevel('debug');
      restore();
    }
    const levels = lines.map((l) => JSON.parse(l).level);
    expect(levels).toEqual(['warn', 'error']);
  });

  test('never throws on circular fields (guarded serialization)', () => {
    const lines = [];
    const restore = logger.__setSink((l) => lines.push(l));
    try {
      const circular = {};
      circular.self = circular;
      expect(() => logger.info('circ', { circular })).not.toThrow();
    } finally {
      restore();
    }
    expect(lines).toHaveLength(1);
  });
});

test.describe('Story 7.1 — logger.js EMF metrics', () => {
  test('build.metric is a valid EMF blob with namespace, dims, value placement', () => {
    const rec = logger.build.metric('ModeSwitch', 1, 'Count', {
      ModeFrom: 'llm',
      ModeTo: 'deluxe-xai',
      Source: 'ui',
      Outcome: 'success',
    });

    // _aws envelope.
    expect(rec._aws).toBeTruthy();
    expect(typeof rec._aws.Timestamp).toBe('number');
    const cw = rec._aws.CloudWatchMetrics[0];
    expect(cw.Namespace).toBe('Test12/UnitTest');
    expect(cw.Metrics).toEqual([{ Name: 'ModeSwitch', Unit: 'Count' }]);
    // Single dimension set listing the dimension keys.
    expect(cw.Dimensions).toEqual([['ModeFrom', 'ModeTo', 'Source', 'Outcome']]);

    // Value at top level keyed by metric name; each dimension value top-level.
    expect(rec.ModeSwitch).toBe(1);
    expect(rec.ModeFrom).toBe('llm');
    expect(rec.ModeTo).toBe('deluxe-xai');
    expect(rec.Source).toBe('ui');
    expect(rec.Outcome).toBe('success');
  });

  test('build.metric supports a per-call namespace override', () => {
    const rec = logger.build.metric('LatencyMs', 42, 'Milliseconds', { Route: '/api/x' }, {}, 'Test12/VoiceMode');
    expect(rec._aws.CloudWatchMetrics[0].Namespace).toBe('Test12/VoiceMode');
    expect(rec.LatencyMs).toBe(42);
  });

  test('build.metric with no dimensions emits a single empty dimension set', () => {
    const rec = logger.build.metric('ColdStart', 1, 'Count');
    expect(rec._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
    expect(rec.ColdStart).toBe(1);
  });

  test('metric() emits one EMF line to the sink', () => {
    const lines = [];
    const restore = logger.__setSink((l) => lines.push(l));
    try {
      logger.metric('RequestCount', 1, 'Count', { Route: '/health', Status: '200' });
    } finally {
      restore();
    }
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.RequestCount).toBe(1);
    expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe('Test12/UnitTest');
  });

  test('extraFields ride along without becoming dimensions (high-cardinality safe)', () => {
    const rec = logger.build.metric('LatencyMs', 99, 'Milliseconds', { Route: '/api/x' }, { requestId: 'abc-123' });
    // requestId is a property for Logs Insights but NOT in the dimension set.
    expect(rec.requestId).toBe('abc-123');
    expect(rec._aws.CloudWatchMetrics[0].Dimensions).toEqual([['Route']]);
  });
});
