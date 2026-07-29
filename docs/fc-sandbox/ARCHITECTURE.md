# Architecture

## Request path

```text
anonymous browser
  -> same-origin Next.js route (no login-cookie refresh)
  -> FC run service / durable state machine
  -> pinned server-only E2B SDK adapter
  -> Alibaba FC Agent Sandbox
  -> private TRIBE v2 scoring endpoint
```

The browser receives a bounded run DTO. It never receives the Supabase secret,
FC Sandbox API key, demo-identity credential, raw sandbox ID, or provider error body. An
Alibaba-hosted lifecycle gateway remains available as an optional deployment
boundary.

## Lifecycle

```text
created
  -> provisioning
  -> validating
  -> awaiting_approval
  -> pausing
  -> hibernated
  -> resuming
  -> scoring
  -> completed
```

Every non-terminal state may transition to `failed`. No transition can jump
from approval to scoring. The approval nonce is invalidated in the same
optimistic state claim that moves `hibernated -> resuming`, so a replay or
concurrent click cannot trigger a second effect.

Before pause, the app creates a versioned digest bound to run ID, trace ID,
checkpoint version, and stage. The sandbox stores that checkpoint, the pinned
creative bytes, their digest, and a live process sentinel. Deep mode verifies
filesystem and checkpoint continuity after a cold boot; light mode additionally
verifies the process. Dynamic-mount consistency remains a separate proof gate
when that FC extension is enabled.

After resume, the trusted server signs a dedicated no-membership Supabase
identity in for a short-lived JWT and sends the restored creative to the
allowlisted TRIBE endpoint. The identity password never enters the sandbox.

## Why VM-level isolation is relevant

Creative files are untrusted, model/tool execution can invoke native codecs,
and separate customers may have confidential pre-launch media. Process-only
isolation is not a sufficient product boundary. The live isolation probe uses
two sandboxes and validates:

1. Compute: sandbox B cannot inspect sandbox A's process or memory sentinel.
2. Network: sandbox B cannot reach sandbox A's private callback/port sentinel.
3. Storage: sandbox B cannot read sandbox A's mount sentinel.

Passing one layer does not mark the capability verified.

## Storage and expiry

`fc_demo_runs` is the current durable state. `fc_demo_run_events` is the
append-only public-safe trace. `fc_capability_evidence` is the proof ledger.
All three use RLS, grant no browser role access, and are accessed only with the
server secret. Public runs expire after one hour. A scheduled cleanup should
delete expired rows after the submission retention window.

The local provider uses process memory and an explicitly labeled fixture. It is
only for UI rehearsal and cannot record a verified capability.

## Fault handling

- Provider calls use bounded timeouts, an idempotency key, and one retry only
  for transient transport or 408/429/5xx failures.
- A stale approval fails closed.
- A checkpoint mismatch fails the run before scoring.
- Provider response schemas are bounded before entering the durable record.
- Cleanup failure is logged without changing a committed score.
- The failure drills in `EVIDENCE_RUNBOOK.md` prove a run remains locatable.
