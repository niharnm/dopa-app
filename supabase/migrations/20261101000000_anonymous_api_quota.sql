-- Durable per-client quotas for public endpoints that have no signed-in user.
-- The caller passes a hashed client key (never a raw IP address).
create schema if not exists private;

create table if not exists private.anonymous_api_rate_limits (
  bucket text not null,
  client_key text not null check (char_length(client_key) between 16 and 128),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (bucket, client_key)
);

create index if not exists anonymous_api_rate_limits_window_idx
  on private.anonymous_api_rate_limits (window_started_at);

revoke all on table private.anonymous_api_rate_limits
  from public, anon, authenticated;

create or replace function public.consume_anonymous_api_quota(
  p_bucket text,
  p_client_key text
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_window interval := interval '1 hour';
  v_now timestamptz := clock_timestamp();
  v_row private.anonymous_api_rate_limits%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  v_limit := case p_bucket
    when 'business_demo_discover' then 8
    else null
  end;

  if v_limit is null then
    raise invalid_parameter_value using message = 'Unknown API quota bucket';
  end if;

  if p_client_key is null or char_length(p_client_key) not between 16 and 128 then
    raise invalid_parameter_value using message = 'Invalid client key';
  end if;

  insert into private.anonymous_api_rate_limits (
    bucket,
    client_key,
    window_started_at,
    request_count
  )
  values (p_bucket, p_client_key, v_now, 1)
  on conflict (bucket, client_key) do update
  set
    window_started_at = case
      when private.anonymous_api_rate_limits.window_started_at <= v_now - v_window
        then v_now
      else private.anonymous_api_rate_limits.window_started_at
    end,
    request_count = case
      when private.anonymous_api_rate_limits.window_started_at <= v_now - v_window
        then 1
      else private.anonymous_api_rate_limits.request_count + 1
    end
  returning * into v_row;

  -- Occasional cleanup keeps the table small without a scheduled job.
  if random() < 0.01 then
    delete from private.anonymous_api_rate_limits
    where window_started_at <= v_now - interval '1 day';
  end if;

  return query
  select
    v_row.request_count <= v_limit,
    case
      when v_row.request_count <= v_limit then 0
      else greatest(
        1,
        ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer
      )
    end,
    greatest(0, v_limit - v_row.request_count);
end;
$$;

revoke all on function public.consume_anonymous_api_quota(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_anonymous_api_quota(text, text)
  to service_role;
