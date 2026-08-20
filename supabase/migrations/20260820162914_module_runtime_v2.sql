-- MOD2 Phase 1: runtime-authoritative registry, dependencies and controlled
-- tenant module lifecycle. Core remains implicit and is never an entitlement.

alter table public.module_catalog
  add column if not exists display_name text,
  add column if not exists description text,
  add column if not exists release_state text not null default 'planned',
  add column if not exists updated_at timestamptz not null default now();

update public.module_catalog
set
  display_name = 'Planning',
  description = 'Interne planning voor afspraken, werkzaamheden en leveringen.',
  release_state = 'released',
  updated_at = now()
where module_key = 'planning';

alter table public.module_catalog
  alter column display_name set not null,
  alter column description set not null;

alter table public.module_catalog
  drop constraint if exists module_catalog_display_name_check,
  drop constraint if exists module_catalog_description_check,
  drop constraint if exists module_catalog_release_state_check;

alter table public.module_catalog
  add constraint module_catalog_display_name_check
    check (char_length(btrim(display_name)) between 1 and 120),
  add constraint module_catalog_description_check
    check (char_length(btrim(description)) between 1 and 1000),
  add constraint module_catalog_release_state_check
    check (release_state in ('planned', 'released', 'retired'));

create or replace function public.set_module_catalog_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_module_catalog_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists module_catalog_set_updated_at on public.module_catalog;
create trigger module_catalog_set_updated_at
before update on public.module_catalog
for each row execute function public.set_module_catalog_updated_at();

create table public.module_dependencies (
  module_key text not null references public.module_catalog(module_key) on update no action on delete restrict,
  depends_on_module_key text not null references public.module_catalog(module_key) on update no action on delete restrict,
  created_at timestamptz not null default now(),
  primary key (module_key, depends_on_module_key),
  constraint module_dependencies_not_self_check check (module_key <> depends_on_module_key)
);

alter table public.module_dependencies enable row level security;
revoke all on table public.module_dependencies from public, anon, authenticated, service_role;

create or replace function public.enforce_module_dependency_acyclic()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  dependency_reaches_module boolean := false;
  graph_too_deep boolean := false;
begin
  if new.module_key = new.depends_on_module_key then
    raise exception 'MODULE_DEPENDENCY_SELF_REFERENCE';
  end if;

  -- Module graphs are small and internal. Serializing graph edits closes the
  -- concurrent A→B / B→A insertion race before evaluating the recursive walk.
  lock table public.module_dependencies in share row exclusive mode;

  with recursive dependency_path(module_key, path) as (
    select new.depends_on_module_key, array[new.depends_on_module_key]
    union all
    select dependency.depends_on_module_key, path.path || dependency.depends_on_module_key
    from public.module_dependencies dependency
    join dependency_path path on dependency.module_key = path.module_key
    where not dependency.depends_on_module_key = any(path.path)
      and cardinality(path.path) < 32
  )
  select
    coalesce(bool_or(module_key = new.module_key), false),
    coalesce(bool_or(cardinality(path) >= 32), false)
  into dependency_reaches_module, graph_too_deep
  from dependency_path;

  if graph_too_deep then
    raise exception 'MODULE_DEPENDENCY_GRAPH_TOO_DEEP';
  end if;

  if dependency_reaches_module then
    raise exception 'MODULE_DEPENDENCY_CYCLE';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_module_dependency_acyclic() from public, anon, authenticated, service_role;

create trigger module_dependencies_acyclic
before insert or update on public.module_dependencies
for each row execute function public.enforce_module_dependency_acyclic();

create or replace function public.resolve_company_module_access(target_company_id uuid, target_module_key text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_release_state text;
  dependency_cycle boolean := false;
  dependency_depth_exceeded boolean := false;
begin
  -- Membership is evaluated before catalog details so callers cannot probe
  -- module state for another company.
  if auth.uid() is null or not public.is_company_member(target_company_id) then
    return 'MODULE_ACCESS_FORBIDDEN';
  end if;

  -- Core is always available to an authenticated company member and is never
  -- represented in module_catalog or company_module_entitlements.
  if target_module_key = 'core' then
    return 'MODULE_AVAILABLE';
  end if;

  select module.release_state into target_release_state
  from public.module_catalog module
  where module.module_key = target_module_key;

  if not found then
    return 'MODULE_NOT_FOUND';
  end if;

  if target_release_state = 'planned' then
    return 'MODULE_NOT_RELEASED';
  end if;

  if target_release_state = 'retired' then
    return 'MODULE_RETIRED';
  end if;

  if not exists (
    select 1
    from public.company_module_entitlements entitlement
    where entitlement.company_id = target_company_id
      and entitlement.module_key = target_module_key
      and entitlement.is_enabled
  ) then
    return 'MODULE_NOT_ENTITLED';
  end if;

  with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
    select target_module_key, array[target_module_key], false, false
    union all
    select
      dependency.depends_on_module_key,
      tree.path || dependency.depends_on_module_key,
      dependency.depends_on_module_key = any(tree.path),
      cardinality(tree.path) >= 32
    from public.module_dependencies dependency
    join dependency_tree tree on dependency.module_key = tree.module_key
    where not tree.cycle and not tree.depth_exceeded
  )
  select
    coalesce(bool_or(cycle), false),
    coalesce(bool_or(depth_exceeded), false)
  into dependency_cycle, dependency_depth_exceeded
  from dependency_tree;

  if dependency_cycle or dependency_depth_exceeded then
    return 'MODULE_DEPENDENCY_MISSING';
  end if;

  if exists (
    with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
      select target_module_key, array[target_module_key], false, false
      union all
      select
        dependency.depends_on_module_key,
        tree.path || dependency.depends_on_module_key,
        dependency.depends_on_module_key = any(tree.path),
        cardinality(tree.path) >= 32
      from public.module_dependencies dependency
      join dependency_tree tree on dependency.module_key = tree.module_key
      where not tree.cycle and not tree.depth_exceeded
    )
    select 1
    from dependency_tree tree
    join public.module_catalog module on module.module_key = tree.module_key
    left join public.company_module_entitlements entitlement
      on entitlement.company_id = target_company_id
      and entitlement.module_key = tree.module_key
      and entitlement.is_enabled
    where tree.module_key <> target_module_key
      and (module.release_state <> 'released' or entitlement.company_id is null)
  ) then
    return 'MODULE_DEPENDENCY_MISSING';
  end if;

  return 'MODULE_AVAILABLE';
end;
$$;

create or replace function public.has_company_module(target_company_id uuid, target_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.resolve_company_module_access(target_company_id, target_module_key) = 'MODULE_AVAILABLE';
$$;

revoke all on function public.resolve_company_module_access(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.has_company_module(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_company_module_access(uuid, text) to authenticated;
grant execute on function public.has_company_module(uuid, text) to authenticated;

create or replace function public.audit_company_module_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
  configured_actor text;
  audit_actor_id uuid;
begin
  if tg_op = 'INSERT' and new.is_enabled then
    audit_action := 'module_entitlement.granted';
  elsif tg_op = 'UPDATE' and old.is_enabled and not new.is_enabled then
    audit_action := 'module_entitlement.revoked';
  elsif tg_op = 'UPDATE' and not old.is_enabled and new.is_enabled then
    audit_action := 'module_entitlement.granted';
  else
    return new;
  end if;

  configured_actor := nullif(current_setting('app.module_entitlement_actor_id', true), '');
  audit_actor_id := case
    when configured_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then configured_actor::uuid
    else auth.uid()
  end;
  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    audit_actor_id,
    audit_action,
    'company_module_entitlement',
    null,
    jsonb_build_object('module_key', new.module_key, 'source', new.source)
  );
  return new;
end;
$$;

create or replace function public.activate_company_module(
  target_company_id uuid,
  target_module_key text,
  activation_source text,
  actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_release_state text;
  existing_enabled boolean;
  dependency_cycle boolean := false;
  dependency_depth_exceeded boolean := false;
begin
  if target_module_key = 'core' then
    raise exception 'MODULE_CORE_IMPLICIT';
  end if;

  if activation_source !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'MODULE_ACTIVATION_SOURCE_INVALID';
  end if;

  if not exists (select 1 from public.companies company where company.id = target_company_id) then
    raise exception 'MODULE_COMPANY_NOT_FOUND';
  end if;

  if actor_user_id is not null and not exists (select 1 from public.users user_record where user_record.id = actor_user_id) then
    raise exception 'MODULE_ACTOR_NOT_FOUND';
  end if;

  -- Activation and deactivation use the same per-company transaction lock so
  -- a dependency cannot be revoked between this validation and the upsert.
  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text, 0));

  select module.release_state into target_release_state
  from public.module_catalog module
  where module.module_key = target_module_key;

  if not found then
    raise exception 'MODULE_NOT_FOUND';
  end if;

  if target_release_state <> 'released' then
    raise exception 'MODULE_NOT_RELEASED';
  end if;

  with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
    select target_module_key, array[target_module_key], false, false
    union all
    select
      dependency.depends_on_module_key,
      tree.path || dependency.depends_on_module_key,
      dependency.depends_on_module_key = any(tree.path),
      cardinality(tree.path) >= 32
    from public.module_dependencies dependency
    join dependency_tree tree on dependency.module_key = tree.module_key
    where not tree.cycle and not tree.depth_exceeded
  )
  select coalesce(bool_or(cycle), false), coalesce(bool_or(depth_exceeded), false)
  into dependency_cycle, dependency_depth_exceeded
  from dependency_tree;

  if dependency_cycle or dependency_depth_exceeded or exists (
    with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
      select target_module_key, array[target_module_key], false, false
      union all
      select
        dependency.depends_on_module_key,
        tree.path || dependency.depends_on_module_key,
        dependency.depends_on_module_key = any(tree.path),
        cardinality(tree.path) >= 32
      from public.module_dependencies dependency
      join dependency_tree tree on dependency.module_key = tree.module_key
      where not tree.cycle and not tree.depth_exceeded
    )
    select 1
    from dependency_tree tree
    join public.module_catalog module on module.module_key = tree.module_key
    left join public.company_module_entitlements entitlement
      on entitlement.company_id = target_company_id
      and entitlement.module_key = tree.module_key
      and entitlement.is_enabled
    where tree.module_key <> target_module_key
      and (module.release_state <> 'released' or entitlement.company_id is null)
  ) then
    raise exception 'MODULE_DEPENDENCY_MISSING';
  end if;

  select entitlement.is_enabled into existing_enabled
  from public.company_module_entitlements entitlement
  where entitlement.company_id = target_company_id
    and entitlement.module_key = target_module_key;

  if found and existing_enabled then
    return false;
  end if;

  perform set_config('app.module_entitlement_actor_id', coalesce(actor_user_id::text, ''), true);
  insert into public.company_module_entitlements (company_id, module_key, is_enabled, source, granted_at, revoked_at)
  values (target_company_id, target_module_key, true, activation_source, now(), null)
  on conflict (company_id, module_key) do update
  set
    is_enabled = true,
    source = excluded.source,
    granted_at = now(),
    revoked_at = null;

  return true;
end;
$$;

create or replace function public.deactivate_company_module(
  target_company_id uuid,
  target_module_key text,
  deactivation_source text,
  actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dependent_cycle boolean := false;
  dependent_depth_exceeded boolean := false;
begin
  if target_module_key = 'core' then
    raise exception 'MODULE_CORE_IMPLICIT';
  end if;

  if deactivation_source !~ '^[a-z][a-z0-9_]{1,62}$' then
    raise exception 'MODULE_DEACTIVATION_SOURCE_INVALID';
  end if;

  if not exists (select 1 from public.companies company where company.id = target_company_id) then
    raise exception 'MODULE_COMPANY_NOT_FOUND';
  end if;

  if actor_user_id is not null and not exists (select 1 from public.users user_record where user_record.id = actor_user_id) then
    raise exception 'MODULE_ACTOR_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text, 0));

  if not exists (select 1 from public.module_catalog module where module.module_key = target_module_key) then
    raise exception 'MODULE_NOT_FOUND';
  end if;

  with recursive dependent_tree(module_key, path, cycle, depth_exceeded) as (
    select dependency.module_key, array[dependency.module_key], false, false
    from public.module_dependencies dependency
    where dependency.depends_on_module_key = target_module_key
    union all
    select
      dependency.module_key,
      tree.path || dependency.module_key,
      dependency.module_key = any(tree.path),
      cardinality(tree.path) >= 32
    from public.module_dependencies dependency
    join dependent_tree tree on dependency.depends_on_module_key = tree.module_key
    where not tree.cycle and not tree.depth_exceeded
  )
  select coalesce(bool_or(cycle), false), coalesce(bool_or(depth_exceeded), false)
  into dependent_cycle, dependent_depth_exceeded
  from dependent_tree;

  if dependent_cycle or dependent_depth_exceeded then
    raise exception 'MODULE_DEPENDENCY_GRAPH_INVALID';
  end if;

  if exists (
    with recursive dependent_tree(module_key, path, cycle, depth_exceeded) as (
      select dependency.module_key, array[dependency.module_key], false, false
      from public.module_dependencies dependency
      where dependency.depends_on_module_key = target_module_key
      union all
      select
        dependency.module_key,
        tree.path || dependency.module_key,
        dependency.module_key = any(tree.path),
        cardinality(tree.path) >= 32
      from public.module_dependencies dependency
      join dependent_tree tree on dependency.depends_on_module_key = tree.module_key
      where not tree.cycle and not tree.depth_exceeded
    )
    select 1
    from dependent_tree tree
    join public.company_module_entitlements entitlement
      on entitlement.company_id = target_company_id
      and entitlement.module_key = tree.module_key
      and entitlement.is_enabled
  ) then
    raise exception 'MODULE_REQUIRED_BY_ENABLED_DEPENDENT';
  end if;

  perform set_config('app.module_entitlement_actor_id', coalesce(actor_user_id::text, ''), true);
  update public.company_module_entitlements entitlement
  set
    is_enabled = false,
    source = deactivation_source,
    revoked_at = now()
  where entitlement.company_id = target_company_id
    and entitlement.module_key = target_module_key
    and entitlement.is_enabled;

  return found;
end;
$$;

revoke all on function public.activate_company_module(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.deactivate_company_module(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_company_module(uuid, text, text, uuid) to service_role;
grant execute on function public.deactivate_company_module(uuid, text, text, uuid) to service_role;

-- Planning retains the same membership/role requirements. Only the module
-- decision changes from the ENT1 boolean to the generic resolver outcome.
drop policy if exists "planning members read events" on public.planning_events;
drop policy if exists "planning managers create events" on public.planning_events;
drop policy if exists "planning managers update events" on public.planning_events;

create policy "planning members read events"
on public.planning_events for select to authenticated
using ((select public.resolve_company_module_access(company_id, 'planning') = 'MODULE_AVAILABLE'));

create policy "planning managers create events"
on public.planning_events for insert to authenticated
with check (
  (select public.resolve_company_module_access(company_id, 'planning') = 'MODULE_AVAILABLE')
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
);

create policy "planning managers update events"
on public.planning_events for update to authenticated
using (
  (select public.resolve_company_module_access(company_id, 'planning') = 'MODULE_AVAILABLE')
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
)
with check (
  (select public.resolve_company_module_access(company_id, 'planning') = 'MODULE_AVAILABLE')
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
);
