---
epic: 7
title: CloudWatch Observability
status: complete
completed: '2026-06-11'
completionNote: 'All stories 7.1–7.7 implemented test-first (logger/EMF, request middleware, domain metrics, error+cold-start, X-Ray, alarms→SNS, dashboard). Remaining real-world verification is post-deploy: confirm metrics/traces appear and alarms fire in CloudWatch.'
supersedes: 'architecture.md Decision D2 (observability deferral)'
created: '2026-06-11'
owner: BMad
metricsFormat: EMF
namespaces:
  app: 'Test12/App'        # request, latency, error, cold-start metrics
  domain: 'Test12/VoiceMode' # mode-switch, realtime-session, escape metrics
relatedDecisions: ['D2 (reversed)', 'API5 (admin stats — complementary, not replaced)']
---

# Epic 7 — CloudWatch Observability

## Why this epic exists

Architecture **Decision D2** scoped MVP observability to `usage_logs` rows
surfaced through the admin endpoint, explicitly deferring CloudWatch ("no
custom metrics, no X-Ray, no APM"). This epic **supersedes D2**: the three
production Lambdas (`test12`, `test12-mcp`, `test12-ws`) should be fully
observable in CloudWatch — custom metrics, structured/queryable logs, alarms
to SNS, an operator dashboard, and X-Ray traces.

`usage_logs` + the Epic 5 admin endpoint are **not** removed — they remain the
per-user billing/bake-off record. CloudWatch is the operational layer on top.

## Runtime constraints (ground truth from the codebase)

- **Lambda (container/zip), `nodejs20.x`, `us-east-1`**, deployed by AWS CLI in
  `deploy.ps1` / `deploy-dev.ps1`; shared role `test12-lambda-role`; IAM is
  managed via raw policy JSON + console, **no IaC framework**.
- `console.*` already streams to **CloudWatch Logs** per Lambda — the gap is
  *structure*, *metrics*, *alarms*, *dashboards*, *traces*.
- AWS SDK **v3** already in use (DynamoDB, Secrets Manager, SES, SNS, API GW
  Mgmt), each built with `region: process.env.AWS_REGION || 'us-east-1'`.

## Design decisions for this epic

- **Metrics = EMF (Embedded Metric Format).** Metrics are emitted as specially
  shaped JSON on stdout; CloudWatch auto-extracts them. **No `PutMetricData`
  on the request path**, no added IAM for emission, no network latency, and it
  is inherently fire-and-forget (honours NFR6). `@aws-sdk/client-cloudwatch` is
  used **only** by deploy-time provisioning scripts (alarms/dashboard), added
  as a **devDependency** so the Lambda bundle stays lean.
- **One logging/metrics module** (`logger.js`, CommonJS, zero runtime deps)
  shared by `app.js`, `lambda.js`, `mcp-*.js`, `ws-handler.js`.
- **Two namespaces:** `Test12/App` (infra/request) and `Test12/VoiceMode`
  (domain). Dimensions kept low-cardinality (Route, Method, Status, Source,
  Outcome) to control custom-metric cost.
- **Tests:** pure-node specs under `tests/*.test.js` (same runner as
  `class-coverage.test.js`) assert the **shape** of emitted JSON/EMF and the
  **purity** of the alarm/dashboard definition builders. Live CloudWatch
  delivery is verified manually post-deploy (documented in the runbook).

## Stories

### Story 7.1 — Structured logger + EMF metric emitter foundation
**As an** operator, **I want** one zero-dependency `logger.js` that emits
structured JSON logs and EMF metrics, **so that** every Lambda has a single,
testable observability primitive.
- `logger.js` exports `debug/info/warn/error(msg, fields)` → single-line JSON
  (`ts`, `level`, `msg`, `service`, …fields); honours `LOG_LEVEL`.
- `metric(name, value, unit, dimensions, fields)` → valid EMF blob under
  `CW_NAMESPACE` (default `Test12/App`): `_aws.CloudWatchMetrics[0]` carries
  `{Namespace, Dimensions:[dimKeys], Metrics:[{Name,Unit}]}`, the value sits at
  top level keyed by `name`, and each dimension value is a top-level field.
- Pure builders (`build.log`, `build.metric`) exported for tests; emission goes
  through one swappable sink.
- **Also updates `architecture.md` D2** to record the reversal (pointer to this
  epic).
- *Tests:* `tests/logger.test.js` — JSON log shape + level filtering; EMF
  envelope validity (with and without dimensions); value/dimension placement.

### Story 7.2 — Request logging + latency/count metrics middleware
**As an** operator, **I want** every HTTP request logged and measured, **so
that** I can see traffic, latency, and status breakdowns in Logs Insights and
metrics.
- Express middleware in `app.js`: derive `requestId` (Lambda
  `context.awsRequestId` via serverless-express, fallback to a uuid), attach to
  `req`, log one structured line per request (method, route, status,
  `durationMs`), and emit EMF `RequestCount` (dims Route, Method, Status) +
  `LatencyMs`.
- Route label uses `req.route?.path || 'unmatched'` to keep dimension
  cardinality bounded (no raw URLs).
- *Tests:* drive the express `app` in-process (supertest-style via node http)
  and assert one request log + the two EMF metrics with correct dims.

### Story 7.3 — Domain metrics: mode-switch, realtime-session, escape (EMF)
**As an** operator running the realtime bake-off, **I want** mode-switch and
session metrics in CloudWatch, **so that** dashboards/alarms can use them.
- A small `metrics/voiceMode.js` helper emitting to `Test12/VoiceMode`:
  `ModeSwitch` (dims ModeFrom, ModeTo, Source, Outcome), `ModeSwitchDurationMs`,
  `RealtimeSessionDurationMs`, `EscapeEvent`.
- Called fire-and-forget alongside `db.recordVoiceModeSwitch` / addon-session
  finalize. **Sequencing:** the write hooks land with Epic 1 Story 1.6 /
  Epic 2; until then this story ships the emitter + a thin call site and tests
  the emitter directly.
- *Tests:* assert EMF dims/values for each domain metric.

### Story 7.4 — Error + cold-start instrumentation
**As an** operator, **I want** errors and cold starts measured, **so that**
reliability is visible and alarmable.
- Central Express error handler: structured error log (message, stack,
  errorClass, route, requestId) + EMF `ErrorCount` (dims ErrorClass, Route).
- `lambda.js`: emit `ColdStart` once per container and `DbInitFailure` when
  `db.init()` fails.
- *Tests:* error handler emits log+metric for a thrown route; cold-start emits
  once.

### Story 7.5 — X-Ray tracing
**As an** operator, **I want** distributed traces, **so that** I can see where
latency and failures originate across the Lambda and its AWS/HTTP calls.
- Add `aws-xray-sdk-core`; capture AWS SDK v3 clients and outbound HTTPS where
  feasible; guard so local (`web.js`/`dev.js`) runs without a daemon don't error.
- `deploy.ps1` enables Lambda active tracing (`--tracing-config Mode=Active`)
  for all three functions; add `xray:PutTraceSegments` +
  `xray:PutTelemetryRecords` to `test12-lambda-role` (policy JSON in repo).
- *Tests:* smoke — app boots and a request succeeds with X-Ray enabled
  (instrumentation must not break the request path); full trace validation is
  manual post-deploy (runbook).

### Story 7.6 — Alarms → SNS (deploy-time provisioning)
**As an** operator, **I want** alarms on the new metrics routed to SNS, **so
that** I'm paged on regressions.
- `scripts/cloudwatch/provision-alarms.mjs` (`@aws-sdk/client-cloudwatch`,
  devDep): idempotent `PutMetricAlarm` for high 5xx rate, p95 `LatencyMs`
  breach, Lambda `Errors`/`Throttles`, and phantom-billing proxy (ModeSwitch
  `Outcome=failure` rate). Ensures a dedicated `test12-alerts` SNS topic.
- Pure `buildAlarmSpecs(env)` → alarm-definition array (unit-tested); the script
  is the thin IO wrapper. Invoked from `deploy.ps1`.
- IAM: `cloudwatch:PutMetricAlarm`, `sns:CreateTopic`, `sns:Subscribe`.
- *Tests:* `buildAlarmSpecs` returns the expected thresholds/namespaces/actions.

### Story 7.7 — Operator dashboard (deploy-time provisioning)
**As an** operator, **I want** a single CloudWatch dashboard, **so that** I can
watch the system at a glance.
- `scripts/cloudwatch/provision-dashboard.mjs` (`PutDashboard`): request
  rate/latency/error widgets, mode-switch outcomes, realtime-session durations,
  Lambda built-ins (invocations, errors, duration, concurrency), and an X-Ray
  link. Pure `buildDashboardBody(env)` → dashboard JSON (unit-tested). Invoked
  from `deploy.ps1`.
- *Tests:* `buildDashboardBody` is valid JSON with the expected widgets/metrics.

## Cross-cutting acceptance / definition of done
- No secret or PII in logs/metrics (no tokens, phone numbers, API keys).
- Emission never throws into the request path (all guarded/fire-and-forget).
- Lambda runtime bundle gains **zero** new runtime dependencies for 7.1–7.4
  (EMF); only `aws-xray-sdk-core` (7.5) is a runtime dep; CloudWatch SDK is
  devDep-only.
- Full `npm test` suite green after each story.
- Architecture D2 updated (7.1); a short observability runbook accompanies 7.6/7.7.
