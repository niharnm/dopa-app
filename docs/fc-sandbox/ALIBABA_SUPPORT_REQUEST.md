# Alibaba support request draft

Do not include the FC Sandbox API key, full account ID, or unmasked sandbox ID.

## Subject

Enable FC Agent Sandbox pause/resume for Dopa hackathon evidence in cn-hangzhou

## Body

We are using FC Agent Sandbox for an approval-gated creative-scoring workflow:
create an isolated sandbox, validate and checkpoint a bounded sample creative,
hibernate while a human approves, resume the same sandbox, verify the
checkpoint, score it, and clean up.

Environment:

- Region: `cn-hangzhou`
- Template: `code-interpreter-v1`
- E2B SDK: `2.31.0`
- FC Agent Sandbox CLI: `2.16.0`
- Sandbox resources observed: 2 vCPU / 2 GiB

Create, command execution, reconnect, filesystem state, process state, session
affinity, and exact cleanup all succeeded. The E2B-compatible `pause()` call
returned:

```text
403 PauseSessionForbidden
pauseSession is not enabled for this function
request id: 1-6a6a10bc-15dbb8ac-3c6e70ddd511
```

Please enable light and deep pause/resume for this FC Agent Sandbox
account/template in `cn-hangzhou`, or identify the exact prerequisite and
quota. Please also confirm whether `keepMemory: false` maps to deep hibernation
for the E2B-compatible endpoint and which billing dimensions remain active
while paused.

We will rerun a bounded single-sandbox lifecycle test after enablement. We will
not run the elasticity test until its quota and maximum spend are confirmed
separately.
