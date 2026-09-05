-- ZC1.9C: entitlement grants and module suspensions foundation.
-- Additive foundation only. Runtime consumers remain compatibility-wired through
-- resolve_company_module_access; broad application convergence is ZC1.9D.

begin;

create table public.entitlement_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  module_key text not null references public.module_catalog(module_key) on update no action on delete restrict,
  source text not null check (source in ('commercial', 'manual', 'internal', 'promotional', 'migration_legacy')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  reference_kind text not null check (reference_kind ~ '^[a-z][a-z0-9_]{1,62}$'),
  reference_key text not null check (char_length(btrim(reference_key)) between 1 and 255),
  actor_kind text not null check (actor_kind in ('user', 'system')),
  actor_user_id uuid references public.users(id) on update no action on delete set null,
  actor_principal text check (actor_principal is null or actor_principal ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on update no action on delete set null,
  revoked_by_principal text check (revoked_by_principal is null or revoked_by_principal ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  constraint entitlement_grants_validity_check check (valid_until is null or valid_until > valid_from),
  constraint entitlement_grants_actor_check check (
    (actor_kind = 'user' and actor_user_id is not null and actor_principal is null)
    or (actor_kind = 'system' and actor_user_id is null and actor_principal is not null)
  ),
  constraint entitlement_grants_state_check check (
    (status = 'active' and revoked_at is null and revoked_by_user_id is null and revoked_by_principal is null)
    or (status = 'revoked' and revoked_at is not null and num_nonnulls(revoked_by_user_id, revoked_by_principal) = 1)
  ),
  constraint entitlement_grants_reference_check check (
    (source = 'migration_legacy' and reference_kind = 'legacy_row')
    or source <> 'migration_legacy'
  ),
  constraint entitlement_grants_identity_unique unique (company_id, module_key, source, reference_kind, reference_key)
);

create index entitlement_grants_active_lookup_idx
  on public.entitlement_grants (company_id, module_key, valid_from, valid_until)
  where status = 'active';
create index entitlement_grants_source_lookup_idx
  on public.entitlement_grants (company_id, source, module_key, status);
create index entitlement_grants_revocation_lookup_idx
  on public.entitlement_grants (company_id, module_key, revoked_at desc)
  where status = 'revoked';

create table public.entitlement_suspensions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  module_key text not null references public.module_catalog(module_key) on update no action on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  reference_kind text not null check (reference_kind ~ '^[a-z][a-z0-9_]{1,62}$'),
  reference_key text not null check (char_length(btrim(reference_key)) between 1 and 255),
  actor_kind text not null check (actor_kind in ('user', 'system')),
  actor_user_id uuid references public.users(id) on update no action on delete set null,
  actor_principal text check (actor_principal is null or actor_principal ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on update no action on delete set null,
  revoked_by_principal text check (revoked_by_principal is null or revoked_by_principal ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  constraint entitlement_suspensions_core_check check (module_key <> 'core'),
  constraint entitlement_suspensions_validity_check check (valid_until is null or valid_until > valid_from),
  constraint entitlement_suspensions_actor_check check (
    (actor_kind = 'user' and actor_user_id is not null and actor_principal is null)
    or (actor_kind = 'system' and actor_user_id is null and actor_principal is not null)
  ),
  constraint entitlement_suspensions_state_check check (
    (status = 'active' and revoked_at is null and revoked_by_user_id is null and revoked_by_principal is null)
    or (status = 'revoked' and revoked_at is not null and num_nonnulls(revoked_by_user_id, revoked_by_principal) = 1)
  ),
  constraint entitlement_suspensions_identity_unique unique (company_id, module_key, reference_kind, reference_key)
);

create index entitlement_suspensions_active_lookup_idx
  on public.entitlement_suspensions (company_id, module_key, valid_from, valid_until)
  where status = 'active';
create index entitlement_suspensions_status_lookup_idx
  on public.entitlement_suspensions (company_id, module_key, status);

alter table public.entitlement_grants enable row level security;
alter table public.entitlement_suspensions enable row level security;
revoke all on table public.entitlement_grants from public, anon, authenticated, service_role;
revoke all on table public.entitlement_suspensions from public, anon, authenticated, service_role;

create or replace function public.entitlement_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.entitlement_touch_updated_at() from public, anon, authenticated, service_role;
drop trigger if exists entitlement_grants_touch_updated_at on public.entitlement_grants;
create trigger entitlement_grants_touch_updated_at
before update on public.entitlement_grants
for each row execute function public.entitlement_touch_updated_at();
drop trigger if exists entitlement_suspensions_touch_updated_at on public.entitlement_suspensions;
create trigger entitlement_suspensions_touch_updated_at
before update on public.entitlement_suspensions
for each row execute function public.entitlement_touch_updated_at();

create or replace function public.audit_entitlement_grant_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    if new.source = 'migration_legacy' then
      audit_action := 'entitlement.legacy_backfilled';
    else
      audit_action := 'entitlement.grant_created';
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'revoked' then
    audit_action := 'entitlement.grant_revoked';
  else
    return new;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    new.actor_user_id,
    audit_action,
    'entitlement_grant',
    new.id,
    jsonb_build_object(
      'module_key', new.module_key,
      'source', new.source,
      'reference_kind', new.reference_kind,
      'reference_key', new.reference_key,
      'status', new.status
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_entitlement_grant_change() from public, anon, authenticated, service_role;
drop trigger if exists entitlement_grants_audit on public.entitlement_grants;
create trigger entitlement_grants_audit
after insert or update of status on public.entitlement_grants
for each row execute function public.audit_entitlement_grant_change();

create or replace function public.audit_entitlement_suspension_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'entitlement.suspension_created';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status = 'revoked' then
    audit_action := 'entitlement.suspension_revoked';
  else
    return new;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    new.actor_user_id,
    audit_action,
    'entitlement_suspension',
    new.id,
    jsonb_build_object(
      'module_key', new.module_key,
      'reference_kind', new.reference_kind,
      'reference_key', new.reference_key,
      'status', new.status
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_entitlement_suspension_change() from public, anon, authenticated, service_role;
drop trigger if exists entitlement_suspensions_audit on public.entitlement_suspensions;
create trigger entitlement_suspensions_audit
after insert or update of status on public.entitlement_suspensions
for each row execute function public.audit_entitlement_suspension_change();

-- The resolver is deliberately read-only. Membership is checked before any
-- module or entitlement lookup to prevent cross-tenant state probing.
create or replace function public.resolve_effective_module_access(target_company_id uuid, target_module_key text)
returns table (decision text, code text, resolved_module_key text, dependency_path text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_release_state text;
  dependency_cycle boolean := false;
  dependency_depth_exceeded boolean := false;
  dependency_path_result text[] := array[]::text[];
begin
  if auth.uid() is null or not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = auth.uid()
  ) then
    decision := 'deny';
    code := 'MODULE_ACCESS_FORBIDDEN';
    resolved_module_key := target_module_key;
    dependency_path := array[]::text[];
    return next;
    return;
  end if;

  if target_module_key = 'core' then
    decision := 'allow';
    code := 'MODULE_AVAILABLE';
    resolved_module_key := target_module_key;
    dependency_path := array['core'];
    return next;
    return;
  end if;

  select module.release_state
    into target_release_state
  from public.module_catalog module
  where module.module_key = target_module_key;

  if not found then
    decision := 'deny';
    code := 'MODULE_NOT_FOUND';
    resolved_module_key := target_module_key;
    dependency_path := array[]::text[];
    return next;
    return;
  end if;

  if target_release_state = 'planned' then
    decision := 'deny';
    code := 'MODULE_NOT_RELEASED';
    resolved_module_key := target_module_key;
    dependency_path := array[target_module_key];
    return next;
    return;
  end if;

  if target_release_state = 'retired' then
    decision := 'deny';
    code := 'MODULE_RETIRED';
    resolved_module_key := target_module_key;
    dependency_path := array[target_module_key];
    return next;
    return;
  end if;

  if exists (
    select 1
    from public.entitlement_suspensions suspension
    where suspension.company_id = target_company_id
      and suspension.module_key = target_module_key
      and suspension.status = 'active'
      and suspension.valid_from <= statement_timestamp()
      and (suspension.valid_until is null or suspension.valid_until > statement_timestamp())
  ) then
    decision := 'deny';
    code := 'MODULE_SUSPENDED';
    resolved_module_key := target_module_key;
    dependency_path := array[target_module_key];
    return next;
    return;
  end if;

  if not exists (
    select 1
    from public.entitlement_grants grant_record
    where grant_record.company_id = target_company_id
      and grant_record.module_key = target_module_key
      and grant_record.status = 'active'
      and grant_record.valid_from <= statement_timestamp()
      and (grant_record.valid_until is null or grant_record.valid_until > statement_timestamp())
  ) then
    decision := 'deny';
    code := 'MODULE_NOT_ENTITLED';
    resolved_module_key := target_module_key;
    dependency_path := array[target_module_key];
    return next;
    return;
  end if;

  with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
    select target_module_key, array[target_module_key]::text[], false, false
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
    coalesce(bool_or(depth_exceeded), false),
    coalesce((array_agg(path order by cardinality(path) desc))[1], array[target_module_key]::text[])
    into dependency_cycle, dependency_depth_exceeded, dependency_path_result
  from dependency_tree;

  if dependency_cycle or dependency_depth_exceeded then
    decision := 'deny';
    code := 'MODULE_DEPENDENCY_MISSING';
    resolved_module_key := target_module_key;
    dependency_path := dependency_path_result;
    return next;
    return;
  end if;

  if exists (
    with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
      select target_module_key, array[target_module_key]::text[], false, false
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
    left join public.module_catalog module on module.module_key = tree.module_key
    where tree.module_key <> target_module_key
      and (
        module.module_key is null
        or module.release_state <> 'released'
        or exists (
          select 1 from public.entitlement_suspensions suspension
          where suspension.company_id = target_company_id
            and suspension.module_key = tree.module_key
            and suspension.status = 'active'
            and suspension.valid_from <= statement_timestamp()
            and (suspension.valid_until is null or suspension.valid_until > statement_timestamp())
        )
        or not exists (
          select 1 from public.entitlement_grants grant_record
          where grant_record.company_id = target_company_id
            and grant_record.module_key = tree.module_key
            and grant_record.status = 'active'
            and grant_record.valid_from <= statement_timestamp()
            and (grant_record.valid_until is null or grant_record.valid_until > statement_timestamp())
        )
      )
  ) then
    decision := 'deny';
    code := 'MODULE_DEPENDENCY_MISSING';
    resolved_module_key := target_module_key;
    dependency_path := dependency_path_result;
    return next;
    return;
  end if;

  decision := 'allow';
  code := 'MODULE_AVAILABLE';
  resolved_module_key := target_module_key;
  dependency_path := dependency_path_result;
  return next;
end;
$$;

revoke all on function public.resolve_effective_module_access(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_effective_module_access(uuid, text) to authenticated;

-- Compatibility contract: existing callers keep their structured MODULE_* code,
-- while the authority is now the new grants/suspensions resolver.
create or replace function public.resolve_company_module_access(target_company_id uuid, target_module_key text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select result.code
  from public.resolve_effective_module_access(target_company_id, target_module_key) result;
$$;

revoke all on function public.resolve_company_module_access(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_company_module_access(uuid, text) to authenticated;

create or replace function public.has_company_module(target_company_id uuid, target_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.resolve_company_module_access(target_company_id, target_module_key) = 'MODULE_AVAILABLE';
$$;

revoke all on function public.has_company_module(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_company_module(uuid, text) to authenticated;

-- The control plane accepts only a database-verifiable owner actor for the
-- currently supported non-commercial sources. Caller-supplied actor metadata
-- is never treated as authorization. Commercial projection and legacy writes
-- remain explicitly blocked in ZC1.9C.
create or replace function public.assert_entitlement_write_actor(
  target_company_id uuid,
  target_source text,
  target_actor_user_id uuid,
  target_actor_principal text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if target_source not in ('manual', 'internal', 'promotional', 'commercial', 'migration_legacy') then
    raise exception 'ENTITLEMENT_INVALID_SOURCE';
  end if;

  if target_source = 'commercial' then
    raise exception 'ENTITLEMENT_COMMERCIAL_PROJECTION_DISABLED';
  end if;

  if target_source = 'migration_legacy' then
    raise exception 'ENTITLEMENT_LEGACY_WRITE_FORBIDDEN';
  end if;

  if target_actor_principal is not null then
    raise exception 'ENTITLEMENT_OPERATOR_CONTEXT_REQUIRED';
  end if;

  if target_actor_user_id is null or not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_actor_user_id
      and membership.role = 'owner'
  ) then
    raise exception 'ENTITLEMENT_OPERATOR_DENIED';
  end if;
end;
$$;

revoke all on function public.assert_entitlement_write_actor(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.create_entitlement_grant(
  target_company_id uuid,
  target_module_key text,
  target_source text,
  target_reason text,
  target_reference_kind text,
  target_reference_key text,
  target_actor_user_id uuid default null,
  target_actor_principal text default null,
  target_valid_from timestamptz default null,
  target_valid_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  perform public.assert_entitlement_write_actor(target_company_id, target_source, target_actor_user_id, target_actor_principal);
  if target_module_key = 'core' then
    raise exception 'ENTITLEMENT_CORE_IMPLICIT';
  end if;
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'ENTITLEMENT_COMPANY_NOT_FOUND';
  end if;
  if not exists (select 1 from public.module_catalog where module_key = target_module_key) then
    raise exception 'MODULE_NOT_FOUND';
  end if;

  select grant_record.id into existing_id
  from public.entitlement_grants grant_record
  where grant_record.company_id = target_company_id
    and grant_record.module_key = target_module_key
    and grant_record.source = target_source
    and grant_record.reference_kind = target_reference_kind
    and grant_record.reference_key = target_reference_key;
  if existing_id is not null then
    return existing_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':' || target_module_key, 0));
  insert into public.entitlement_grants (
    company_id, module_key, source, reason, reference_kind, reference_key,
    actor_kind, actor_user_id, valid_from, valid_until
  ) values (
    target_company_id, target_module_key, target_source, target_reason,
    target_reference_kind, target_reference_key, 'user', target_actor_user_id,
    coalesce(target_valid_from, now()), target_valid_until
  ) on conflict (company_id, module_key, source, reference_kind, reference_key) do nothing
  returning id into new_id;
  if new_id is not null then
    return new_id;
  end if;
  select grant_record.id into existing_id
  from public.entitlement_grants grant_record
  where grant_record.company_id = target_company_id
    and grant_record.module_key = target_module_key
    and grant_record.source = target_source
    and grant_record.reference_kind = target_reference_kind
    and grant_record.reference_key = target_reference_key;
  return existing_id;
end;
$$;

revoke all on function public.create_entitlement_grant(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_entitlement_grant(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz)
  to service_role;

create or replace function public.revoke_entitlement_grant(
  target_grant_id uuid,
  target_actor_user_id uuid default null,
  target_actor_principal text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  grant_record public.entitlement_grants%rowtype;
begin
  select * into grant_record from public.entitlement_grants where id = target_grant_id for update;
  if not found then
    raise exception 'ENTITLEMENT_GRANT_NOT_FOUND';
  end if;
  if grant_record.source = 'migration_legacy' then
    raise exception 'ENTITLEMENT_LEGACY_WRITE_FORBIDDEN';
  end if;
  perform public.assert_entitlement_write_actor(grant_record.company_id, grant_record.source, target_actor_user_id, target_actor_principal);
  if grant_record.status = 'revoked' then
    return false;
  end if;
  update public.entitlement_grants
  set status = 'revoked', revoked_at = now(), revoked_by_user_id = target_actor_user_id
  where id = target_grant_id and status = 'active';
  return found;
end;
$$;

revoke all on function public.revoke_entitlement_grant(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_entitlement_grant(uuid, uuid, text) to service_role;

create or replace function public.create_entitlement_suspension(
  target_company_id uuid,
  target_module_key text,
  target_reason text,
  target_reference_kind text,
  target_reference_key text,
  target_actor_user_id uuid default null,
  target_actor_principal text default null,
  target_valid_from timestamptz default null,
  target_valid_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  perform public.assert_entitlement_write_actor(target_company_id, 'manual', target_actor_user_id, target_actor_principal);
  if target_module_key = 'core' then
    raise exception 'ENTITLEMENT_CORE_IMPLICIT';
  end if;
  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'ENTITLEMENT_COMPANY_NOT_FOUND';
  end if;
  if not exists (select 1 from public.module_catalog where module_key = target_module_key) then
    raise exception 'MODULE_NOT_FOUND';
  end if;

  select suspension.id into existing_id
  from public.entitlement_suspensions suspension
  where suspension.company_id = target_company_id
    and suspension.module_key = target_module_key
    and suspension.reference_kind = target_reference_kind
    and suspension.reference_key = target_reference_key;
  if existing_id is not null then
    return existing_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':' || target_module_key, 0));
  insert into public.entitlement_suspensions (
    company_id, module_key, reason, reference_kind, reference_key,
    actor_kind, actor_user_id, valid_from, valid_until
  ) values (
    target_company_id, target_module_key, target_reason, target_reference_kind,
    target_reference_key, 'user', target_actor_user_id,
    coalesce(target_valid_from, now()), target_valid_until
  ) on conflict (company_id, module_key, reference_kind, reference_key) do nothing
  returning id into new_id;
  if new_id is not null then
    return new_id;
  end if;
  select suspension.id into existing_id
  from public.entitlement_suspensions suspension
  where suspension.company_id = target_company_id
    and suspension.module_key = target_module_key
    and suspension.reference_kind = target_reference_kind
    and suspension.reference_key = target_reference_key;
  return existing_id;
end;
$$;

revoke all on function public.create_entitlement_suspension(uuid, text, text, text, text, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_entitlement_suspension(uuid, text, text, text, text, uuid, text, timestamptz, timestamptz)
  to service_role;

create or replace function public.revoke_entitlement_suspension(
  target_suspension_id uuid,
  target_actor_user_id uuid default null,
  target_actor_principal text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  suspension_record public.entitlement_suspensions%rowtype;
begin
  select * into suspension_record from public.entitlement_suspensions where id = target_suspension_id for update;
  if not found then
    raise exception 'ENTITLEMENT_SUSPENSION_NOT_FOUND';
  end if;
  perform public.assert_entitlement_write_actor(suspension_record.company_id, 'manual', target_actor_user_id, target_actor_principal);
  if suspension_record.status = 'revoked' then
    return false;
  end if;
  update public.entitlement_suspensions
  set status = 'revoked', revoked_at = now(), revoked_by_user_id = target_actor_user_id
  where id = target_suspension_id and status = 'active';
  return found;
end;
$$;

revoke all on function public.revoke_entitlement_suspension(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_entitlement_suspension(uuid, uuid, text) to service_role;

-- Legacy lifecycle writes are frozen to prevent two writable authorities. The
-- old table remains intact for compatibility and rollback analysis.
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
begin
  if target_company_id is null and target_module_key is null and activation_source is null and actor_user_id is null then
    null;
  end if;
  raise exception 'LEGACY_ENTITLEMENT_WRITES_FROZEN';
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
begin
  if target_company_id is null and target_module_key is null and deactivation_source is null and actor_user_id is null then
    null;
  end if;
  raise exception 'LEGACY_ENTITLEMENT_WRITES_FROZEN';
end;
$$;

revoke all on function public.activate_company_module(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.deactivate_company_module(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_company_module(uuid, text, text, uuid) to service_role;
grant execute on function public.deactivate_company_module(uuid, text, text, uuid) to service_role;

-- Deterministic, non-destructive backfill. Disabled legacy rows are deliberately
-- excluded and the source is never reclassified as commercial.
insert into public.entitlement_grants (
  company_id, module_key, source, status, valid_from, valid_until, reason,
  reference_kind, reference_key, actor_kind, actor_principal
)
select
  legacy.company_id,
  legacy.module_key,
  'migration_legacy',
  'active',
  legacy.granted_at,
  null,
  'Backfilled from enabled legacy entitlement',
  'legacy_row',
  'legacy_row:' || encode(
    extensions.digest(
      (legacy.company_id::text || '|' || legacy.module_key || '|' || legacy.source || '|' || legacy.granted_at::text)::bytea,
      'sha256'
    ),
    'hex'
  ),
  'system',
  'legacy_backfill'
from public.company_module_entitlements legacy
where legacy.is_enabled
on conflict (company_id, module_key, source, reference_kind, reference_key) do nothing;

commit;
