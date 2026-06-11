---
epic: 7
title: CloudWatch Observability — Operator Runbook
status: reference
created: '2026-06-11'
region: us-east-1
functions: ['test12', 'test12-mcp', 'test12-ws']
namespaces: ['Test12/App', 'Test12/VoiceMode']
---

# Epic 7 — Observability Runbook

How to operate and verify the CloudWatch integration shipped in Epic 7. Tests
prove the *emission shape*; only a live deploy proves *delivery* — this doc is
the post-deploy checklist and reference.

## 1. One-time setup (before/with first deploy)

1. **Install deps:** `npm install` (brings `aws-xray-sdk-core` +
   `@aws-sdk/client-cloudwatch`).
2. **IAM on `test12-lambda-role`** (same manual-attach convention as
   `sns-ses-policy.json`):
   - X-Ray: attach `xray-policy.json` (or the managed `AWSXRayDaemonWriteAccess`).
   - The role needs no extra perms to *emit* metrics/logs — EMF + Logs are
     written to stdout, which Lambda already ships.
3. **IAM on the deploying principal** (runs the provisioning scripts in
   `deploy.ps1` Step 9): `cloudwatch:PutMetricAlarm`, `cloudwatch:PutDashboard`,
   `sns:CreateTopic`.
4. **Alerts:** after the first deploy, subscribe an endpoint to the
   `test12-alerts` SNS topic:
   `aws sns subscribe --topic-arn <arn> --protocol email --notification-endpoint you@example.com`

## 2. Metric catalog

EMF auto-extracts these from stdout. Dimensioned metrics publish one stream per
dimension-set — to aggregate, use metric-math `SEARCH(...)` (the alarms and
dashboard already do).

### Namespace `Test12/App` (infra/request — logger.js, app.js, lambda.js)

| Metric | Unit | Dimensions | Source |
|---|---|---|---|
| `RequestCount` | Count | Route, Method, Status | request middleware (7.2) |
| `LatencyMs` | Milliseconds | Route | request middleware (7.2) |
| `ErrorCount` | Count | ErrorClass, Route | error handler (7.4) |
| `ColdStart` | Count | Fn | lambda.js module init (7.4) |
| `DbInitFailure` | Count | Fn | lambda.js DB-init failure (7.4) |

### Namespace `Test12/VoiceMode` (domain — metrics.js)

| Metric | Unit | Dimensions | Source |
|---|---|---|---|
| `ModeSwitch` | Count | ModeFrom, ModeTo, Source, Outcome | recordModeSwitch (7.3) |
| `ModeSwitchDurationMs` | Milliseconds | Source, Outcome | recordModeSwitch (7.3) |
| `RealtimeSessionDurationMs` | Milliseconds | Mode | recordRealtimeSession (7.3) |
| `EscapeEvent` | Count | FromMode, Source | recordEscape (7.3) |

> The `Test12/VoiceMode` metrics start flowing once the server-side write hooks
> land (`db.recordVoiceModeSwitch` — Story 1.6; addon-session finalize /
> end-session — Epic 2). The emitter is shipped and unit-tested now.

Dimension values are **whitelisted** (`metrics.js`): unknown mode/source/outcome
collapse to `other`, bounding custom-metric cardinality (= cost).

## 3. Structured logs (Logs Insights)

Every log line is one JSON object with `ts`, `level`, `msg`, `service`, plus
context. Useful queries (CloudWatch Logs Insights, log group
`/aws/lambda/test12`):

```
# Request volume + p95 latency by route
fields route, durationMs
| filter msg = "request"
| stats count(*) as n, pct(durationMs, 95) as p95 by route
| sort n desc

# Recent errors with class + route
fields ts, errorClass, route, status, message
| filter msg = "request_error"
| sort ts desc | limit 50

# Correlate one request across log + error by id
fields ts, msg, route, status
| filter requestId = "<awsRequestId>"
```

`LOG_LEVEL` env var (default `info`) gates `debug`/`info`. No secrets/PII are
logged (no tokens, phone numbers, API keys).

## 4. Post-deploy verification checklist

1. **Logs:** hit the site, then in Logs Insights run the request query above —
   expect `msg="request"` lines with `route`, `status`, `durationMs`,
   `requestId`.
2. **Metrics:** CloudWatch → Metrics → `Test12/App` → confirm `RequestCount`
   and `LatencyMs` have datapoints. `ColdStart` appears after a cold start
   (deploy or idle).
3. **Traces:** CloudWatch → X-Ray traces / Service map → confirm the `test12`
   service node with downstream DynamoDB/SNS/SES + external HTTP segments. If
   empty, check the Lambda has `Mode=Active` (`aws lambda
   get-function-configuration --function-name test12 --query TracingConfig`) and
   the role has the X-Ray policy.
4. **Dashboard:** open `test12-observability`
   (`https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=test12-observability`).
5. **Alarms:** CloudWatch → Alarms → the five below exist and are `OK` (not
   `INSUFFICIENT_DATA` after traffic). Test routing once with
   `aws cloudwatch set-alarm-state --alarm-name test12-lambda-errors
   --state-value ALARM --state-reason "runbook test"` and confirm the SNS
   notification arrives, then let it self-reset.

## 5. Alarm inventory (provision-alarms.js)

| Alarm | Metric | Condition |
|---|---|---|
| `test12-lambda-errors` | AWS/Lambda Errors (Sum) | ≥ 5 in 5 min |
| `test12-lambda-throttles` | AWS/Lambda Throttles (Sum) | ≥ 1 in 5 min |
| `test12-lambda-duration-p95` | AWS/Lambda Duration (p95) | ≥ 3000 ms, 3×5 min |
| `test12-db-init-failure` | Test12/App DbInitFailure (Sum) | ≥ 1 in 5 min |
| `test12-app-errors` | Test12/App ErrorCount via SEARCH (Sum) | ≥ 10 in 5 min |

All → `test12-alerts` SNS topic; `TreatMissingData=notBreaching`. Thresholds are
deliberately conservative starting points — tune in `buildAlarmSpecs()` once
real baselines exist, then re-run a deploy (provisioning is idempotent).

## 6. Re-provisioning / changes

Alarms and the dashboard are upserted on every `deploy.ps1` run (Step 9). To
change them, edit the pure builders (`buildAlarmSpecs` / `buildDashboardBody`),
update the specs in `tests/alarms-spec.test.js` / `tests/dashboard-spec.test.js`,
`npm test`, then deploy. To run provisioning alone:
`$env:AWS_REGION='us-east-1'; node scripts/cloudwatch/provision-alarms.js;
node scripts/cloudwatch/provision-dashboard.js`.

## 7. Cost notes

- EMF metrics are billed as custom metrics per unique namespace+name+dimension
  set. The dimension whitelists keep this bounded; the highest-cardinality is
  `RequestCount` (Route × Method × Status) — Route is the express *pattern*
  (e.g. `/api/channels/:id`), never the raw URL.
- X-Ray is billed per recorded/retrieved trace; default sampling (1 req/s + 5%)
  applies. Adjust via an X-Ray sampling rule if volume grows.
