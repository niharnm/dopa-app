# Dopa FC Sandbox submission

> Dopa gives performance marketers a pre-spend creative decision, pausing
> isolated AgentRun compute while a human reviews the creative so teams do not
> pay to keep a long-running workflow idle.

The anonymous judge path is `/demo`; the evidence ledger is `/fc-proof`.
Neither page turns implementation or local timing into a provider claim.

## Rubric coverage

| Dimension | Product evidence | Live proof gate |
| --- | --- | --- |
| Real scenario | Creative validation -> human approval -> TRIBE v2 score is a natural execute-wait-execute workflow. | A real live score and user walkthrough. |
| UX | Anonymous start, visible lifecycle, hibernation clock, one approval, result in one screen. | Browser run against the deployed URL. |
| Stable FC execution | Bounded state machine, idempotency keys, one retry for transient provider failures, expiry, cleanup. | AgentRun run plus injected timeout and failed-resume drills. |
| Observability | One trace ID, durable events, versioned checkpoint digest, signed provider callbacks. | SLS logstore, trace, metrics, alert rule, and a real debugging incident. |
| Extensible skills | The orchestration depends on `FcSandboxProvider`, not a model SDK; the gateway contract isolates tools and scoring. | Swap the scoring tool or model without changing lifecycle code. |
| Core capabilities | Separate evidence rows for elasticity, isolation, E2B, sessions, hibernation, and observability. | `bun run verify:fc-sandbox --record` with all live prerequisites. |
| Security | Server-only provider credentials, hashed run tokens, one-time approvals, origin checks, RLS/no browser grants, signed callbacks. | Credential rotation after pause and Alibaba RAM review. |
| Delivery | Golden-path demo, OpenAPI gateway contract, migration, evidence harness, failure runbook, and 3-minute script. | Deploy gateway, apply migration, configure Vercel, record video. |
| Cost | Active and hibernated duration are recorded separately; no local timing is treated as billing. | Current Alibaba price/bill export and a quantified wait-time comparison. |
| Continuity | Durable run records, provider interface, template pin, checkpoint version, session/dynamic-mount evidence. | Resume after a long pause with matching in-sandbox and mount digests. |

## Current live status

On 2026-07-29, the FC E2B-compatible endpoint successfully created a real
Hangzhou sandbox and verified command execution, reconnect, file/process state,
session affinity, and cleanup. The real pause call returned
`PauseSessionForbidden`, so hibernation remains blocked by Alibaba allowlist
access. Independent E2B parity, SLS evidence, peak elasticity, and the settled
billing export also remain pending. The ledger stays conservative because the
handbook requires provider evidence, not configuration claims.

## Files

- `ARCHITECTURE.md` - trust boundaries and state transitions.
- `DEPLOYMENT.md` - migration, gateway, Vercel, and rollback order.
- `EVIDENCE_RUNBOOK.md` - live capability probes and failure drills.
- `DEMO_SCRIPT.md` - three-minute judge script.
- `SECURITY.md` - credentials, anonymous access, isolation, and retention.
- `LIVE_EVIDENCE_2026-07-29.md` - first real FC run and allowlist blocker.
- `ALIBABA_SUPPORT_REQUEST.md` - secret-free pause/resume enablement draft.
- `infra/agentrun/gateway-contract.openapi.yaml` - private gateway contract.

## Official baselines

- [AgentRun AIO Sandbox API](https://help.aliyun.com/en/functioncompute/aio-sandbox)
- [AgentRun 2025-09-10 API overview](https://help.aliyun.com/en/functioncompute/api-agentrun-2025-09-10-overview)
- [FC deep hibernation](https://help.aliyun.com/en/functioncompute/fc/sandbox-deep-hibernation-pause-and-resume-session)
- [FC Agent Sandbox billing](https://help.aliyun.com/en/functioncompute/pay-as-you-go-of-fc-agent-sandbox)

Prices, allowlist status, supported regions, and preview rules change. Recheck
the official pages and the account console immediately before the evidence run.
