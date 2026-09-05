-- Keep the frozen legacy lifecycle signatures lint-clean without changing
-- their fail-closed behavior.

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
