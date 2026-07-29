# Live FC Agent Sandbox evidence - 2026-07-29

This record separates provider-observed behavior from implementation claims.
Secrets and full account identifiers are intentionally omitted.

## Environment

- Region: `cn-hangzhou`
- FC Agent Sandbox CLI: `2.16.0`
- E2B SDK: `2.31.0`
- Template: `code-interpreter-v1` (`Ready`, public)
- Runtime: 2 vCPU, 2 GiB memory, Python `3.13.13`
- Sandbox: `sbx-c95e6f00...ebdc` (destroyed after the test)

## Provider-observed results

1. Alibaba accepted the newly scoped FC Sandbox API key.
2. The E2B-compatible endpoint created an FC-backed sandbox.
3. The sandbox ran Python and shell commands.
4. A file checkpoint survived reconnect with SHA-256:
   `f02899a7313eee81f5375c40a2b55eed5a7e13828c008da65db92ad7772ca391`.
5. A background process was still alive after reconnect.
6. Provider metadata reported header-field session affinity and a stable FC
   session ID for the sandbox.
7. Cleanup succeeded, and a subsequent `running,paused` list returned `[]`.

## Strong-isolation probe

A controlled run created two separate 2 vCPU / 2 GiB sandboxes:
`sbx-a622235b...02b5` and `sbx-fdc108c3...75db`.

Sandbox A started a uniquely named process, wrote a unique file sentinel, and
opened a private listener. From sandbox B, the probe observed:

```json
{
  "computeDenied": true,
  "storageDenied": true,
  "networkDenied": true,
  "networkError": "TimeoutError"
}
```

Both sandboxes were killed in cleanup, and the provider again returned `[]`
for `running,paused`.

## Hibernation blocker

The real `sandbox.pause()` call failed with:

```text
403 PauseSessionForbidden
pauseSession is not enabled for this function
request id: 1-6a6a10bc-15dbb8ac-3c6e70ddd511
```

Alibaba documents pause/resume as allowlist-gated. Therefore this run does not
claim hibernation, wake latency, resume consistency, or hibernation savings.
Those evidence rows must remain pending until Alibaba enables pause/resume for
the account or template.

## Rubric effect

| Capability | State after this run |
| --- | --- |
| Create, execute, reconnect, file/process state, cleanup | Provider observed |
| Session affinity | Provider observed |
| Pause/resume and wake latency | Blocked by provider allowlist |
| Independent E2B parity | Pending a separate E2B credential |
| Isolation across two sandboxes | Provider observed across compute, storage, and network |
| 100,000/min elasticity | Pending quota confirmation and capped stress run |
| SLS trace, metrics, and alert | Pending cloud-side log configuration |
| Actual cost | Pending the settled billing export |

The published preview rate projects this short functional run at less than
`0.01 CNY`, but the billing documentation states that actual preview charges
are controlled by the console and billing statement. No projected value is
recorded as actual cost evidence.
