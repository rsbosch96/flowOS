-- ZC1.9C repair: select the longest dependency path without array_agg
-- dimensionality coercion. No data mutation or authority change.

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
    select 1 from public.company_memberships membership
    where membership.company_id = target_company_id and membership.user_id = auth.uid()
  ) then
    decision := 'deny'; code := 'MODULE_ACCESS_FORBIDDEN'; resolved_module_key := target_module_key; dependency_path := array[]::text[];
    return next; return;
  end if;

  if target_module_key = 'core' then
    decision := 'allow'; code := 'MODULE_AVAILABLE'; resolved_module_key := target_module_key; dependency_path := array['core'];
    return next; return;
  end if;

  select module.release_state into target_release_state
  from public.module_catalog module where module.module_key = target_module_key;
  if not found then
    decision := 'deny'; code := 'MODULE_NOT_FOUND'; resolved_module_key := target_module_key; dependency_path := array[]::text[];
    return next; return;
  end if;
  if target_release_state = 'planned' then
    decision := 'deny'; code := 'MODULE_NOT_RELEASED'; resolved_module_key := target_module_key; dependency_path := array[target_module_key];
    return next; return;
  end if;
  if target_release_state = 'retired' then
    decision := 'deny'; code := 'MODULE_RETIRED'; resolved_module_key := target_module_key; dependency_path := array[target_module_key];
    return next; return;
  end if;

  if exists (
    select 1 from public.entitlement_suspensions suspension
    where suspension.company_id = target_company_id and suspension.module_key = target_module_key
      and suspension.status = 'active' and suspension.valid_from <= statement_timestamp()
      and (suspension.valid_until is null or suspension.valid_until > statement_timestamp())
  ) then
    decision := 'deny'; code := 'MODULE_SUSPENDED'; resolved_module_key := target_module_key; dependency_path := array[target_module_key];
    return next; return;
  end if;

  if not exists (
    select 1 from public.entitlement_grants grant_record
    where grant_record.company_id = target_company_id and grant_record.module_key = target_module_key
      and grant_record.status = 'active' and grant_record.valid_from <= statement_timestamp()
      and (grant_record.valid_until is null or grant_record.valid_until > statement_timestamp())
  ) then
    decision := 'deny'; code := 'MODULE_NOT_ENTITLED'; resolved_module_key := target_module_key; dependency_path := array[target_module_key];
    return next; return;
  end if;

  with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
    select target_module_key, array[target_module_key]::text[], false, false
    union all
    select dependency.depends_on_module_key, tree.path || dependency.depends_on_module_key,
      dependency.depends_on_module_key = any(tree.path), cardinality(tree.path) >= 32
    from public.module_dependencies dependency
    join dependency_tree tree on dependency.module_key = tree.module_key
    where not tree.cycle and not tree.depth_exceeded
  )
  select coalesce(bool_or(cycle), false), coalesce(bool_or(depth_exceeded), false)
    into dependency_cycle, dependency_depth_exceeded
  from dependency_tree;

  with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
    select target_module_key, array[target_module_key]::text[], false, false
    union all
    select dependency.depends_on_module_key, tree.path || dependency.depends_on_module_key,
      dependency.depends_on_module_key = any(tree.path), cardinality(tree.path) >= 32
    from public.module_dependencies dependency
    join dependency_tree tree on dependency.module_key = tree.module_key
    where not tree.cycle and not tree.depth_exceeded
  )
  select path into dependency_path_result
  from dependency_tree
  order by cardinality(path) desc
  limit 1;

  if dependency_cycle or dependency_depth_exceeded then
    decision := 'deny'; code := 'MODULE_DEPENDENCY_MISSING'; resolved_module_key := target_module_key; dependency_path := dependency_path_result;
    return next; return;
  end if;

  if exists (
    with recursive dependency_tree(module_key, path, cycle, depth_exceeded) as (
      select target_module_key, array[target_module_key]::text[], false, false
      union all
      select dependency.depends_on_module_key, tree.path || dependency.depends_on_module_key,
        dependency.depends_on_module_key = any(tree.path), cardinality(tree.path) >= 32
      from public.module_dependencies dependency
      join dependency_tree tree on dependency.module_key = tree.module_key
      where not tree.cycle and not tree.depth_exceeded
    )
    select 1 from dependency_tree tree
    left join public.module_catalog module on module.module_key = tree.module_key
    where tree.module_key <> target_module_key
      and (module.module_key is null or module.release_state <> 'released'
        or exists (
          select 1 from public.entitlement_suspensions suspension
          where suspension.company_id = target_company_id and suspension.module_key = tree.module_key
            and suspension.status = 'active' and suspension.valid_from <= statement_timestamp()
            and (suspension.valid_until is null or suspension.valid_until > statement_timestamp())
        )
        or not exists (
          select 1 from public.entitlement_grants grant_record
          where grant_record.company_id = target_company_id and grant_record.module_key = tree.module_key
            and grant_record.status = 'active' and grant_record.valid_from <= statement_timestamp()
            and (grant_record.valid_until is null or grant_record.valid_until > statement_timestamp())
        ))
  ) then
    decision := 'deny'; code := 'MODULE_DEPENDENCY_MISSING'; resolved_module_key := target_module_key; dependency_path := dependency_path_result;
    return next; return;
  end if;

  decision := 'allow'; code := 'MODULE_AVAILABLE'; resolved_module_key := target_module_key; dependency_path := dependency_path_result;
  return next;
end;
$$;

revoke all on function public.resolve_effective_module_access(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.resolve_effective_module_access(uuid, text) to authenticated;
