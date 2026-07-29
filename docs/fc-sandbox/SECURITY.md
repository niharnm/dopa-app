# Security model

## Credentials and least privilege

- The web server holds an expiring, workload-specific FC Sandbox API key, not
  a primary-account AccessKey. An optional Alibaba-hosted gateway can move this
  credential into a separate execution role.
- The server signs a dedicated, non-member Supabase demo identity in
  immediately before scoring. Only its short-lived access JWT reaches TRIBE;
  the password and JWT are never copied into the sandbox or browser. A static
  bearer is supported only as a short-lived compatibility fallback.
- The browser holds only a short-lived opaque run token and one-time approval
  nonce.
- Run and approval tokens are stored as HMAC hashes. Provider callback bodies
  require a separate HMAC signature over `timestamp.body`, reject timestamps
  outside five minutes, and deduplicate the provider event ID.
- Rotate the FC Sandbox key and demo-identity password after the evidence run.
  Prove a paused run can resume after those credentials are refreshed.

## Anonymous surface

Only the pinned `retail_launch` sample is accepted. Anonymous callers cannot
upload arbitrary code, URLs, tool arguments, or files. Mutation routes require
same-origin JSON with byte limits. Runs are rate-limited by a keyed network
fingerprint and expire after one hour.

Run access uses `Authorization: Bearer` on reads and a bounded JSON body on
approval, avoiding tokens in URLs, analytics, and referrer logs. Public DTOs
mask sandbox IDs and omit raw provider errors and secrets.

## Database

The migration enables RLS on all FC tables and revokes `anon` and
`authenticated`. Only the server secret role can access them. The app uses a
minimal DTO layer rather than sending database rows to Client Components.

Before production, run Supabase security/performance advisors and verify the
new tables and trigger function. Retain only evidence required for judging;
delete expired anonymous runs with an audited scheduled job.

## Sandbox and network

- Session isolation and per-run dynamic mounts are mandatory.
- The direct adapter creates sandboxes with outbound internet disabled. Deep
  mode preserves the filesystem while intentionally dropping process memory;
  light mode also checks live-process continuity. TRIBE scoring is performed by
  the trusted server using the creative bytes restored from the sandbox.
- An optional gateway validates the requested scoring target against its own
  allowlist.
- No user-supplied hostname is ever proxied.
- The live isolation probe must cover compute, network, and storage.

## Human approval

Approval is bound to one run and one checkpoint. The nonce is invalidated
before resume is called. A stale, replayed, expired, or cross-run nonce fails
closed. Scoring cannot be reached directly from the approval state.

## Logs and privacy

Structured logs contain run ID, trace ID, stage, safe error code, provider
request ID, and durations. They exclude access tokens, approval nonces, API
keys, raw creative bytes, and provider error bodies. Creative/media retention
must be documented separately before enabling arbitrary user uploads.
