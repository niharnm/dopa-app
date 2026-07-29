# Deployment and rollback

This sequence intentionally separates deployable code from live proof. Do not
set `FC_SANDBOX_PROVIDER=agentrun` until every readiness item is green.

## 1. Confirm account scope and cost

1. Confirm the target region supports the chosen Sandbox mode and deep
   hibernation.
2. Confirm deep hibernation is enabled for the account; the FC session feature
   may require allowlist access.
3. Record the current active, light, deep, disk, request, and snapshot prices
   from the account console. Deep hibernation can still incur disk charges.
4. Set explicit spend and concurrency limits before any stress test.

## 2. Apply the database migration

Review and apply:

```bash
supabase db push
```

Then run Supabase security and performance advisors. Verify the three
`fc_*` tables have RLS enabled, no `anon`/`authenticated` grants or policies,
and `service_role` access only.

## 3. Configure the live FC adapter

The preferred path uses pinned `e2b@2.31.0` from the Next.js server with an
expiring FC Agent Sandbox API key:

```text
E2B_API_KEY=<FC Sandbox key>
E2B_API_URL=https://api.cn-hangzhou.e2b.fc.aliyuncs.com
E2B_DOMAIN=cn-hangzhou.e2b.fc.aliyuncs.com
AGENTRUN_TEMPLATE_NAME=code-interpreter-v1
AGENTRUN_HIBERNATION_MODE=deep
```

The key stays in server-only environment variables. The adapter creates a
secure sandbox with outbound internet disabled, copies the pinned demo
creative and checkpoint into it, verifies file/checkpoint continuity after a
deep resume (and process continuity in optional light mode), then kills the
exact sandbox after scoring.

`infra/agentrun/gateway-contract.openapi.yaml` remains the optional
Alibaba-hosted gateway path for teams that need a separate execution role,
dynamic mounts, or cloud-side extensions.

Live requirements:

- AgentRun template pinned by immutable version.
- Session affinity and session isolation enabled.
- Dynamic mount configured per sandbox/run.
- Pause/resume enabled for the account/template and verified via authoritative
  `paused` state, not only a successful request.
- TRIBE base URL, dedicated demo-identity credentials, and pinned creative URL
  stored server-side. The identity must have no business memberships or
  dashboard access.
- SLS structured logs, trace export, metrics, and at least one alert rule are
  active.
- Sandbox key and demo-identity password rotated after proof.

## 4. Configure the web app

Use `.env.example` as the key list. Generate independent 32-byte-or-longer
values for the demo token, callback secret, and demo-identity password. The
server obtains a fresh short-lived Supabase access JWT for each scoring request;
do not place a founder session token in `DOPA_API_INTERNAL_TOKEN`. Set:

```text
FC_SANDBOX_PROVIDER=agentrun
```

only after the database and gateway health checks pass. `NEXT_PUBLIC_*` values
are build-time values; rebuild after changing them.

## 5. Verify without recording

```bash
FC_DEMO_BASE_URL=https://your-deployment.example \
bun run verify:fc-sandbox
```

This must print live results and must not modify the evidence table.

## 6. Record signed evidence

Only after reviewing the output:

```bash
FC_DEMO_BASE_URL=https://your-deployment.example \
bun run verify:fc-sandbox --record
```

Reopen `/fc-proof` and confirm each green row has a source, digest, and observed
time. Cost remains configured until reconciled with a real bill export.

## Rollback

1. Set `FC_SANDBOX_PROVIDER=local` and redeploy the web app.
2. Revoke/rotate the FC Sandbox API key and any lifecycle gateway token.
3. Stop remaining sandboxes and sessions by exact ID; do not use a broad delete.
4. Preserve evidence records and logs for judging/debugging.
5. Roll back the adapter/gateway version. The database migration is additive
   and does not need to be destroyed during application rollback.
