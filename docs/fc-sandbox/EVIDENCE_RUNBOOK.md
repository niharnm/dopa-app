# Evidence and failure runbook

## Golden-path evidence

Run `bun run verify:fc-sandbox` first without `--record`. The harness rejects
local mode, requires `PAUSED -> READY/RUNNING`, checks the checkpoint digest,
requires the complete lifecycle event set, and rejects a non-TRIBE result. The
harness uses the same create-then-prepare split as the browser so provisioning
and validation remain visible while the prepare request is active.

`--record` writes a capability as verified only with a source reference,
SHA-256 source digest, observation time, and structured metrics. The harness
filters weaker updates and the database rejects any status downgrade, so a
later pending probe cannot erase stronger evidence.

## 6.1 Extreme elasticity

The handbook baseline is 100,000 creations/minute and a 5,000/second peak.
That test can create material cost. The gateway must require all of:

```text
FC_ELASTICITY_TARGET=100000
FC_STRESS_ACK=I_ACCEPT_ALIBABA_CLOUD_CHARGES
FC_STRESS_MAX_SPEND_CNY=<approved amount>
```

Run a low-volume rehearsal first. For the scored run, export attempted,
successful, failed, creations/minute, peak/second, and p50/p95 response time.
Do not label a 100-request smoke test as near-peak proof.

## 6.2 Strong isolation

Create sandboxes A and B with separate sessions and mounts. Write unique
sentinels in A, then show B fails to:

1. inspect A's process/memory sentinel;
2. connect to A's private port/network sentinel;
3. read A's dynamic-mount/storage sentinel.

Record the denied operation, error class, sandbox IDs in masked form, template
version, and trace IDs. Clean up both exact IDs.

## 6.3 E2B compatibility

Run one pinned source payload through the E2B adapter and the AgentRun adapter.
The evidence must include:

- one source digest;
- both normalized stdout/result digests;
- dependency and runtime versions;
- endpoint-only adapter difference.

The checkout now has a gitignored Alibaba FC Sandbox key for the
E2B-compatible endpoint. An independent E2B-hosted credential is still needed
for the dual-platform comparison, so this proof remains pending.

## 6.4 Stateful sessions

At the approval checkpoint, capture the in-sandbox checkpoint digest, dynamic
mount digest, session ID, and snapshot ID. Resume after a long enough interval
to demonstrate a real wait. Confirm process/file state and the mount digest
before scoring.

## 6.5 Hibernation and cost

Confirm the provider reaches `PAUSED`; a request returning 200 is insufficient.
Record pause-to-resume duration and measured wake latency. Export current bill
rates and calculate:

```text
kept-active cost = average_wait_hours * active_hourly_rate
deep cost        = average_wait_hours * deep_disk_hourly_rate
saving percent   = (kept-active - deep) / kept-active * 100
```

Include request/snapshot charges if present. Do not say deep hibernation is
free: current FC Agent Sandbox rules can charge for disk.

The first live call on 2026-07-29 returned `PauseSessionForbidden`; see
`LIVE_EVIDENCE_2026-07-29.md`. Do not rerun the scored hibernation path until
Alibaba confirms that pause/resume is enabled for the account or template.

## 6.6 Observability and debugging story

Wire SLS logs, a cross-service trace, latency/error metrics, and an alert before
the run. Inject one controlled failure, use the trace ID to identify its exact
stage, fix it, and retain before/after evidence.

Suggested drill: configure the resume health check to expect an intentionally
wrong checkpoint digest. The run must become `failed`, remain findable by trace
ID, and never call scoring. Restore the correct digest and rerun. Document the
actual SLS query, alert, root cause, and measured recovery. Do not write this as
a "real debugging story" until it has actually happened.

## Other failure drills

- Expired approval nonce -> 409 and no provider call.
- Duplicate approval -> one resume effect.
- Gateway timeout -> bounded retry, then locatable failed run.
- Scoring 5xx -> failed run, safe public code, provider details only in logs.
- Callback with a bad signature -> 401 and no durable event.
- Cleanup failure -> committed result retained and cleanup error logged.
