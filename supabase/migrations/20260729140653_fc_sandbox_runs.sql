-- Durable, server-only state for the public FC Sandbox demonstration.
-- Browser clients never access these tables directly; all reads are projected
-- through the bounded DTOs in lib/fc-sandbox/repository.ts.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create table if not exists public.fc_demo_runs (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null default gen_random_uuid(),
  public_token_hash text not null unique,
  approval_nonce_hash text not null,
  request_fingerprint_hash text not null,
  scenario text not null default 'retail_launch',
  provider text not null check (provider in ('agentrun', 'local')),
  evidence_class text not null check (
    evidence_class in ('verified_cloud', 'local_demonstration')
  ),
  status text not null check (
    status in (
      'created',
      'provisioning',
      'validating',
      'awaiting_approval',
      'pausing',
      'hibernated',
      'resuming',
      'scoring',
      'completed',
      'failed'
    )
  ),
  sandbox_id text,
  sandbox_state text,
  checkpoint_hash text,
  checkpoint_version integer not null default 0 check (checkpoint_version >= 0),
  result jsonb,
  safe_error_code text,
  requested_at timestamptz not null default now(),
  paused_at timestamptz,
  resumed_at timestamptz,
  completed_at timestamptz,
  active_ms integer not null default 0 check (active_ms >= 0),
  hibernated_ms integer not null default 0 check (hibernated_ms >= 0),
  wake_latency_ms integer check (wake_latency_ms is null or wake_latency_ms >= 0),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fc_demo_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.fc_demo_runs(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  event_type text not null,
  stage text not null,
  summary text not null check (char_length(summary) <= 240),
  evidence_class text not null check (
    evidence_class in ('verified_cloud', 'local_demonstration')
  ),
  checkpoint_hash text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create table if not exists public.fc_capability_evidence (
  capability text primary key,
  status text not null check (status in ('verified', 'configured', 'pending')),
  source text,
  source_digest text,
  observed_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 500),
  updated_at timestamptz not null default now(),
  check (
    status <> 'verified'
    or (source is not null and source_digest is not null and observed_at is not null)
  )
);

create index if not exists fc_demo_runs_fingerprint_created_idx
  on public.fc_demo_runs (request_fingerprint_hash, created_at desc);
create index if not exists fc_demo_runs_expires_idx
  on public.fc_demo_runs (expires_at);
create index if not exists fc_demo_run_events_run_sequence_idx
  on public.fc_demo_run_events (run_id, sequence);
create unique index if not exists fc_demo_run_events_provider_event_idx
  on public.fc_demo_run_events (run_id, ((metadata ->> 'providerEventId')))
  where event_type = 'provider.trace'
    and metadata ? 'providerEventId';

create or replace function public.set_fc_demo_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fc_demo_runs_set_updated_at on public.fc_demo_runs;
create trigger fc_demo_runs_set_updated_at
before update on public.fc_demo_runs
for each row execute function public.set_fc_demo_updated_at();

drop trigger if exists fc_capability_evidence_set_updated_at
  on public.fc_capability_evidence;
create trigger fc_capability_evidence_set_updated_at
before update on public.fc_capability_evidence
for each row execute function public.set_fc_demo_updated_at();

create or replace function public.prevent_fc_evidence_downgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_rank integer := case old.status
    when 'verified' then 2
    when 'configured' then 1
    else 0
  end;
  v_new_rank integer := case new.status
    when 'verified' then 2
    when 'configured' then 1
    else 0
  end;
begin
  if v_new_rank < v_old_rank then
    raise check_violation using
      message = 'FC capability evidence cannot be downgraded';
  end if;
  return new;
end;
$$;

drop trigger if exists fc_capability_evidence_prevent_downgrade
  on public.fc_capability_evidence;
create trigger fc_capability_evidence_prevent_downgrade
before update on public.fc_capability_evidence
for each row execute function public.prevent_fc_evidence_downgrade();

alter table public.fc_demo_runs enable row level security;
alter table public.fc_demo_run_events enable row level security;
alter table public.fc_capability_evidence enable row level security;

revoke all on table public.fc_demo_runs from anon, authenticated;
revoke all on table public.fc_demo_run_events from anon, authenticated;
revoke all on table public.fc_capability_evidence from anon, authenticated;
revoke all on sequence public.fc_demo_run_events_id_seq from anon, authenticated;
revoke all on function public.set_fc_demo_updated_at() from public;
revoke all on function public.prevent_fc_evidence_downgrade() from public;

grant select, insert, update, delete on table public.fc_demo_runs to service_role;
grant select, insert, update, delete on table public.fc_demo_run_events to service_role;
grant select, insert, update, delete on table public.fc_capability_evidence
  to service_role;
grant usage, select on sequence public.fc_demo_run_events_id_seq to service_role;

create or replace function public.create_fc_demo_run(
  p_run jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.fc_demo_runs%rowtype;
begin
  if jsonb_typeof(p_run) <> 'object'
    or jsonb_typeof(p_event) <> 'object' then
    raise invalid_parameter_value using message = 'Invalid run payload';
  end if;

  insert into public.fc_demo_runs
  select (jsonb_populate_record(
    null::public.fc_demo_runs,
    p_run
  )).*
  returning * into v_run;

  insert into public.fc_demo_run_events (
    run_id,
    sequence,
    event_type,
    stage,
    summary,
    evidence_class,
    checkpoint_hash,
    duration_ms,
    metadata,
    occurred_at
  )
  values (
    v_run.id,
    1,
    p_event ->> 'event_type',
    v_run.status,
    p_event ->> 'summary',
    v_run.evidence_class,
    p_event ->> 'checkpoint_hash',
    null,
    coalesce(p_event -> 'metadata', '{}'::jsonb),
    (p_event ->> 'occurred_at')::timestamptz
  );

  return to_jsonb(v_run);
end;
$$;

create or replace function public.transition_fc_demo_run(
  p_run_id uuid,
  p_expected_status text,
  p_next_status text,
  p_patch jsonb,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.fc_demo_runs%rowtype;
  v_sequence integer;
begin
  if jsonb_typeof(p_patch) <> 'object'
    or jsonb_typeof(p_event) <> 'object' then
    raise invalid_parameter_value using message = 'Invalid transition payload';
  end if;

  select *
  into v_run
  from public.fc_demo_runs
  where id = p_run_id
  for update;

  if not found or v_run.status <> p_expected_status then
    return null;
  end if;

  select coalesce(max(sequence), 0) + 1
  into v_sequence
  from public.fc_demo_run_events
  where run_id = p_run_id;

  update public.fc_demo_runs
  set
    status = p_next_status,
    sandbox_id = case
      when p_patch ? 'sandbox_id' then p_patch ->> 'sandbox_id'
      else sandbox_id
    end,
    sandbox_state = case
      when p_patch ? 'sandbox_state' then p_patch ->> 'sandbox_state'
      else sandbox_state
    end,
    checkpoint_hash = case
      when p_patch ? 'checkpoint_hash' then p_patch ->> 'checkpoint_hash'
      else checkpoint_hash
    end,
    checkpoint_version = case
      when p_patch ? 'checkpoint_version'
        then (p_patch ->> 'checkpoint_version')::integer
      else checkpoint_version
    end,
    result = case
      when p_patch ? 'result' then p_patch -> 'result'
      else result
    end,
    safe_error_code = case
      when p_patch ? 'safe_error_code' then p_patch ->> 'safe_error_code'
      else safe_error_code
    end,
    paused_at = case
      when p_patch ? 'paused_at'
        then (p_patch ->> 'paused_at')::timestamptz
      else paused_at
    end,
    resumed_at = case
      when p_patch ? 'resumed_at'
        then (p_patch ->> 'resumed_at')::timestamptz
      else resumed_at
    end,
    completed_at = case
      when p_patch ? 'completed_at'
        then (p_patch ->> 'completed_at')::timestamptz
      else completed_at
    end,
    active_ms = case
      when p_patch ? 'active_ms' then (p_patch ->> 'active_ms')::integer
      else active_ms
    end,
    hibernated_ms = case
      when p_patch ? 'hibernated_ms'
        then (p_patch ->> 'hibernated_ms')::integer
      else hibernated_ms
    end,
    wake_latency_ms = case
      when p_patch ? 'wake_latency_ms'
        then (p_patch ->> 'wake_latency_ms')::integer
      else wake_latency_ms
    end,
    approval_nonce_hash = case
      when p_patch ? 'approval_nonce_hash'
        then p_patch ->> 'approval_nonce_hash'
      else approval_nonce_hash
    end
  where id = p_run_id
  returning * into v_run;

  insert into public.fc_demo_run_events (
    run_id,
    sequence,
    event_type,
    stage,
    summary,
    evidence_class,
    checkpoint_hash,
    duration_ms,
    metadata,
    occurred_at
  )
  values (
    p_run_id,
    v_sequence,
    p_event ->> 'event_type',
    p_next_status,
    p_event ->> 'summary',
    v_run.evidence_class,
    p_event ->> 'checkpoint_hash',
    case
      when p_event ? 'duration_ms' and p_event -> 'duration_ms' <> 'null'::jsonb
        then (p_event ->> 'duration_ms')::integer
      else null
    end,
    coalesce(p_event -> 'metadata', '{}'::jsonb),
    (p_event ->> 'occurred_at')::timestamptz
  );

  return to_jsonb(v_run);
end;
$$;

create or replace function public.append_fc_demo_event(
  p_run_id uuid,
  p_event jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.fc_demo_runs%rowtype;
  v_sequence integer;
  v_provider_event_id text := p_event -> 'metadata' ->> 'providerEventId';
begin
  if jsonb_typeof(p_event) <> 'object' then
    raise invalid_parameter_value using message = 'Invalid event payload';
  end if;

  select *
  into v_run
  from public.fc_demo_runs
  where id = p_run_id
  for update;

  if not found then
    return false;
  end if;

  if v_provider_event_id is not null and exists (
    select 1
    from public.fc_demo_run_events
    where run_id = p_run_id
      and event_type = 'provider.trace'
      and metadata ->> 'providerEventId' = v_provider_event_id
  ) then
    return true;
  end if;

  select coalesce(max(sequence), 0) + 1
  into v_sequence
  from public.fc_demo_run_events
  where run_id = p_run_id;

  insert into public.fc_demo_run_events (
    run_id,
    sequence,
    event_type,
    stage,
    summary,
    evidence_class,
    checkpoint_hash,
    duration_ms,
    metadata,
    occurred_at
  )
  values (
    p_run_id,
    v_sequence,
    p_event ->> 'event_type',
    v_run.status,
    p_event ->> 'summary',
    v_run.evidence_class,
    p_event ->> 'checkpoint_hash',
    case
      when p_event ? 'duration_ms' and p_event -> 'duration_ms' <> 'null'::jsonb
        then (p_event ->> 'duration_ms')::integer
      else null
    end,
    coalesce(p_event -> 'metadata', '{}'::jsonb),
    (p_event ->> 'occurred_at')::timestamptz
  );

  return true;
end;
$$;

revoke all on function public.transition_fc_demo_run(
  uuid, text, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.create_fc_demo_run(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.append_fc_demo_event(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_fc_demo_run(jsonb, jsonb)
  to service_role;
grant execute on function public.transition_fc_demo_run(
  uuid, text, text, jsonb, jsonb
) to service_role;
grant execute on function public.append_fc_demo_event(uuid, jsonb)
  to service_role;

create table if not exists private.fc_demo_rate_limits (
  fingerprint_hash text primary key
    check (fingerprint_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

revoke all on table private.fc_demo_rate_limits
  from public, anon, authenticated;

create or replace function public.consume_fc_demo_quota(
  p_fingerprint_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := 4;
  v_window interval := interval '1 hour';
  v_now timestamptz := clock_timestamp();
  v_row private.fc_demo_rate_limits%rowtype;
begin
  if p_fingerprint_hash !~ '^[a-f0-9]{64}$' then
    raise invalid_parameter_value using message = 'Invalid fingerprint';
  end if;

  insert into private.fc_demo_rate_limits (
    fingerprint_hash,
    window_started_at,
    request_count
  )
  values (p_fingerprint_hash, v_now, 1)
  on conflict (fingerprint_hash) do update
  set
    window_started_at = case
      when private.fc_demo_rate_limits.window_started_at <= v_now - v_window
        then v_now
      else private.fc_demo_rate_limits.window_started_at
    end,
    request_count = case
      when private.fc_demo_rate_limits.window_started_at <= v_now - v_window
        then 1
      else private.fc_demo_rate_limits.request_count + 1
    end
  returning * into v_row;

  return query
  select
    v_row.request_count <= v_limit,
    case
      when v_row.request_count <= v_limit then 0
      else greatest(
        1,
        ceil(extract(epoch from (
          v_row.window_started_at + v_window - v_now
        )))::integer
      )
    end;
end;
$$;

revoke all on function public.consume_fc_demo_quota(text)
  from public, anon, authenticated;
grant execute on function public.consume_fc_demo_quota(text)
  to service_role;

insert into public.fc_capability_evidence (
  capability,
  status,
  source,
  source_digest,
  observed_at,
  metrics,
  notes
)
values
  (
    'sandbox_lifecycle',
    'verified',
    'docs/fc-sandbox/LIVE_EVIDENCE_2026-07-29.md#provider-observed-results',
    '840791bb970104c4052095002e1674553d980218a90d7f00a8614f2f09fe276b',
    '2026-07-29T14:42:00Z'::timestamptz,
    '{"region":"cn-hangzhou","template":"code-interpreter-v1","cpuCount":2,"memoryMB":2048,"cliVersion":"2.16.0","sdkVersion":"2.31.0","cleanupVerified":true}'::jsonb,
    'Provider observed create, execute, reconnect, file/process state, and exact cleanup.'
  ),
  (
    'hibernation_wakeup',
    'pending',
    null,
    null,
    null,
    '{}'::jsonb,
    'Live pause returned PauseSessionForbidden; requires Alibaba allowlist enablement.'
  ),
  (
    'stateful_sessions',
    'pending',
    null,
    null,
    null,
    '{}'::jsonb,
    'Session affinity was observed, but resume and dynamic-mount consistency remain pending.'
  ),
  (
    'strong_isolation',
    'verified',
    'docs/fc-sandbox/LIVE_EVIDENCE_2026-07-29.md#strong-isolation-probe',
    '840791bb970104c4052095002e1674553d980218a90d7f00a8614f2f09fe276b',
    '2026-07-29T14:52:00Z'::timestamptz,
    '{"region":"cn-hangzhou","computeDenied":true,"networkDenied":true,"storageDenied":true,"networkError":"TimeoutError","cleanupVerified":true}'::jsonb,
    'Two live FC sandboxes denied compute, network, and storage sentinel access.'
  ),
  (
    'extreme_elasticity',
    'pending',
    null,
    null,
    null,
    '{}'::jsonb,
    'Requires a quota-approved, capped near-peak concurrent burst.'
  ),
  (
    'e2b_compatibility',
    'pending',
    null,
    null,
    null,
    '{}'::jsonb,
    'Requires the same pinned payload on independent E2B and FC endpoints.'
  ),
  (
    'observability',
    'pending',
    null,
    null,
    null,
    '{}'::jsonb,
    'Requires SLS logs, trace correlation, metrics, an alert, and a failure drill.'
  ),
  (
    'cost_efficiency',
    'pending',
    null,
    null,
    null,
    '{}'::jsonb,
    'Requires settled provider billing and a successful hibernation interval.'
  )
on conflict (capability) do nothing;
