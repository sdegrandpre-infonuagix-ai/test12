// Epic 7 / Story 7.7 — CloudWatch dashboard body (pure builder).
//
// Unit-tests buildDashboardBody(env) — the pure function producing the
// PutDashboard DashboardBody. The PutDashboard IO lives in main() (exercised at
// deploy). The body must be valid JSON CloudWatch accepts: a widgets[] array of
// metric widgets covering request/latency/error, voice-mode domain metrics, and
// the Lambda built-ins.

const { test, expect } = require('@playwright/test');

const { buildDashboardBody, DEFAULTS } = require('../scripts/cloudwatch/provision-dashboard');

const ENV = {
  region: 'us-east-1',
  functionName: 'test12',
  appNamespace: 'Test12/App',
  voiceModeNamespace: 'Test12/VoiceMode',
};

test.describe('Story 7.7 — dashboard body', () => {
  const body = buildDashboardBody(ENV);

  test('is a widgets[] object that serializes to valid JSON', () => {
    expect(Array.isArray(body.widgets)).toBe(true);
    expect(body.widgets.length).toBeGreaterThanOrEqual(5);
    const json = JSON.stringify(body);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test('every widget is a metric widget pinned to the configured region', () => {
    for (const w of body.widgets) {
      expect(w.type).toBe('metric');
      expect(w.properties).toBeTruthy();
      expect(w.properties.region).toBe('us-east-1');
      expect(typeof w.properties.title).toBe('string');
      // CloudWatch requires positive widget dimensions.
      expect(w.width).toBeGreaterThan(0);
      expect(w.height).toBeGreaterThan(0);
    }
  });

  test('covers the app, voice-mode, and Lambda metric surfaces', () => {
    const json = JSON.stringify(body);
    // App / request metrics.
    expect(json).toContain('RequestCount');
    expect(json).toContain('ErrorCount');
    // Voice-mode domain metrics.
    expect(json).toContain('ModeSwitch');
    expect(json).toContain('RealtimeSessionDurationMs');
    // Lambda built-ins.
    expect(json).toContain('AWS/Lambda');
    expect(json).toContain('Duration');
    expect(json).toContain('Invocations');
    // Namespaces present.
    expect(json).toContain('Test12/App');
    expect(json).toContain('Test12/VoiceMode');
  });

  test('aggregate app metrics use metric-math SEARCH (dimensioned EMF safe)', () => {
    // At least one widget aggregates a dimensioned EMF metric via SEARCH rather
    // than naming a single dimension stream.
    const json = JSON.stringify(body);
    expect(json).toContain('SEARCH(');
    expect(json).toMatch(/SEARCH\([^)]*ErrorCount/);
  });

  test('widgets are laid out without vertical overlap', () => {
    // Each widget sits at or below the previous row's bottom — no y collisions
    // for same-column widgets (sanity check on the layout cursor).
    const rows = {};
    for (const w of body.widgets) {
      const key = `${w.x}`;
      rows[key] = rows[key] || [];
      rows[key].push([w.y, w.y + w.height]);
    }
    for (const spans of Object.values(rows)) {
      spans.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 0.001);
      }
    }
  });

  test('default dashboard name is exported for the provisioner', () => {
    expect(DEFAULTS.dashboardName).toBe('test12-observability');
  });
});
