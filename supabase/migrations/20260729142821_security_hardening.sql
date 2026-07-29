-- Least-privilege access, ownership-safe RLS, and durable per-user API quotas.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.api_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, bucket)
);

revoke all on table private.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_quota(p_bucket text)
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
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_window interval := interval '1 hour';
  v_now timestamptz := clock_timestamp();
  v_row private.api_rate_limits%rowtype;
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  v_limit := case p_bucket
    when 'business_auto_discover' then 20
    when 'competitor_discover' then 30
    when 'competitor_moves' then 60
    when 'keyword_generate' then 30
    when 'google_ads_read' then 120
    else null
  end;

  if v_limit is null then
    raise invalid_parameter_value using message = 'Unknown API quota bucket';
  end if;

  insert into private.api_rate_limits (
    user_id,
    bucket,
    window_started_at,
    request_count
  )
  values (v_user_id, p_bucket, v_now, 1)
  on conflict (user_id, bucket) do update
  set
    window_started_at = case
      when private.api_rate_limits.window_started_at <= v_now - v_window
        then v_now
      else private.api_rate_limits.window_started_at
    end,
    request_count = case
      when private.api_rate_limits.window_started_at <= v_now - v_window
        then 1
      else private.api_rate_limits.request_count + 1
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
    end,
    greatest(0, v_limit - v_row.request_count);
end;
$$;

revoke all on function public.consume_api_quota(text) from public, anon;
grant execute on function public.consume_api_quota(text) to authenticated;

-- Anonymous clients do not need direct table access. RLS remains enabled as
-- defense in depth for authenticated Data API access.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public
  from authenticated;
grant select, insert, update, delete on
  public.businesses,
  public.user_preferences,
  public.products,
  public.competitors,
  public.competitor_moves
to authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_name_length'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_name_length
      check (char_length(name) between 1 and 160) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'businesses_website_shape'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_website_shape
      check (
        website is null
        or (
          char_length(website) <= 2048
          and website ~ '^https?://'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'businesses_profile_lengths'
      and conrelid = 'public.businesses'::regclass
  ) then
    alter table public.businesses
      add constraint businesses_profile_lengths
      check (
        char_length(coalesce(industry, '')) <= 120
        and char_length(coalesce(description, '')) <= 2000
        and char_length(coalesce(target_audience, '')) <= 2000
        and char_length(coalesce(brand_voice, '')) <= 120
        and char_length(coalesce(value_proposition, '')) <= 2000
        and char_length(coalesce(competitors, '')) <= 2000
        and char_length(coalesce(markets, '')) <= 1000
        and char_length(coalesce(campaign_goal, '')) <= 120
        and char_length(coalesce(price_range, '')) <= 120
        and char_length(coalesce(target_keywords, '')) <= 2000
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_field_limits'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_field_limits
      check (
        char_length(product_name) between 1 and 160
        and char_length(coalesce(category, '')) <= 120
        and char_length(coalesce(value_prop, '')) <= 2000
        and char_length(coalesce(target_sub_demographic, '')) <= 2000
        and cardinality(key_features) <= 50
        and cardinality(creative_hooks) <= 50
        and char_length(array_to_string(key_features, '')) <= 25000
        and char_length(array_to_string(creative_hooks, '')) <= 25000
        and (price is null or price between 0 and 999999999)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'competitors_field_limits'
      and conrelid = 'public.competitors'::regclass
  ) then
    alter table public.competitors
      add constraint competitors_field_limits
      check (
        char_length(name) between 1 and 160
        and char_length(coalesce(website_url, '')) <= 2048
        and char_length(coalesce(logo_url, '')) <= 2048
        and char_length(coalesce(primary_angle, '')) <= 1000
        and (website_url is null or website_url ~ '^https?://')
        and (logo_url is null or logo_url ~ '^https?://')
        and (predicted_ctr is null or predicted_ctr between 0 and 100)
        and status in ('tracking', 'outperforming', 'threat')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'competitor_moves_field_limits'
      and conrelid = 'public.competitor_moves'::regclass
  ) then
    alter table public.competitor_moves
      add constraint competitor_moves_field_limits
      check (
        move_type in (
          'ad_launched',
          'price_change',
          'positioning_pivot',
          'hook_change'
        )
        and char_length(title) between 1 and 200
        and char_length(coalesce(description, '')) <= 1000
        and char_length(coalesce(ad_media_url, '')) <= 2048
        and (ad_media_url is null or ad_media_url ~ '^https?://')
        and (predicted_ctr is null or predicted_ctr between 0 and 100)
        and risk_level in ('low', 'medium', 'high')
      ) not valid;
  end if;
end;
$migration$;

alter table public.businesses
  validate constraint businesses_name_length,
  validate constraint businesses_website_shape,
  validate constraint businesses_profile_lengths;
alter table public.products
  validate constraint products_field_limits;
alter table public.competitors
  validate constraint competitors_field_limits;
alter table public.competitor_moves
  validate constraint competitor_moves_field_limits;

drop policy if exists "Users can view own businesses" on public.businesses;
drop policy if exists "Users can create own businesses" on public.businesses;
drop policy if exists "Users can update own businesses" on public.businesses;
drop policy if exists "Users can delete own businesses" on public.businesses;

create policy "Users can view own businesses"
  on public.businesses
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create own businesses"
  on public.businesses
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update own businesses"
  on public.businesses
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete own businesses"
  on public.businesses
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Users can view own preferences"
  on public.user_preferences;
drop policy if exists "Users can insert own preferences"
  on public.user_preferences;
drop policy if exists "Users can update own preferences"
  on public.user_preferences;

create policy "Users can view own preferences"
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      selected_business_id is null
      or exists (
        select 1
        from public.businesses b
        where b.id = selected_business_id
          and b.owner_id = (select auth.uid())
      )
    )
  );

create policy "Users can update own preferences"
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      selected_business_id is null
      or exists (
        select 1
        from public.businesses b
        where b.id = selected_business_id
          and b.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can view products for own businesses"
  on public.products;
drop policy if exists "Users can create products for own businesses"
  on public.products;
drop policy if exists "Users can update products for own businesses"
  on public.products;
drop policy if exists "Users can delete products for own businesses"
  on public.products;

create policy "Users can view products for own businesses"
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = products.business_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy "Users can create products for own businesses"
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.businesses b
      where b.id = products.business_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy "Users can update products for own businesses"
  on public.products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = products.business_id
        and b.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.businesses b
      where b.id = products.business_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy "Users can delete products for own businesses"
  on public.products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = products.business_id
        and b.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Users can manage competitors of their businesses"
  on public.competitors;
drop policy if exists "Users can manage moves of their competitors"
  on public.competitor_moves;

create policy "Users can manage competitors of their businesses"
  on public.competitors
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.businesses b
      where b.id = competitors.business_id
        and b.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.businesses b
      where b.id = competitors.business_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy "Users can manage moves of their competitors"
  on public.competitor_moves
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.competitors c
      join public.businesses b on b.id = c.business_id
      where c.id = competitor_moves.competitor_id
        and b.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.competitors c
      join public.businesses b on b.id = c.business_id
      where c.id = competitor_moves.competitor_id
        and b.owner_id = (select auth.uid())
    )
  );
