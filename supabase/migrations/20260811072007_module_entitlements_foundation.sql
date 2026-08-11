-- ENT1: optional modules are company-scoped and deny-by-default. Core stays
-- implicit for valid company members and therefore has no entitlement row.

create table public.module_catalog (
  module_key text primary key check (module_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  created_at timestamptz not null default now()
);

create table public.company_module_entitlements (
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  module_key text not null references public.module_catalog(module_key) on update no action on delete restrict,
  is_enabled boolean not null default true,
  source text not null check (source ~ '^[a-z][a-z0-9_]{1,62}$'),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (company_id, module_key),
  constraint company_module_entitlements_state_check check (
    (is_enabled and revoked_at is null)
    or (not is_enabled and revoked_at is not null)
  )
);

-- Only Planning is a real optional module in ENT1. Future modules are added
-- through later forward migrations or controlled provisioning, never by users.
insert into public.module_catalog (module_key)
values ('planning')
on conflict (module_key) do nothing;

alter table public.module_catalog enable row level security;
alter table public.company_module_entitlements enable row level security;

-- Entitlements are product-control infrastructure. There is deliberately no
-- direct Data API access or client-side mutation path.
revoke all on table public.module_catalog from public, anon, authenticated, service_role;
revoke all on table public.company_module_entitlements from public, anon, authenticated, service_role;

create or replace function public.has_company_module(target_company_id uuid, target_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.is_company_member(target_company_id)
    and (
      target_module_key = 'core'
      or exists (
        select 1
        from public.company_module_entitlements entitlement
        where entitlement.company_id = target_company_id
          and entitlement.module_key = target_module_key
          and entitlement.is_enabled
      )
    );
$$;

revoke all on function public.has_company_module(uuid, text)
  from public, anon, authenticated, service_role;
-- Authenticated execution is required by Next.js server-session checks and by
-- Planning RLS. The function only returns a boolean for the caller's own tenant.
grant execute on function public.has_company_module(uuid, text) to authenticated;

-- Existing tenants retain the production-released Planning capability. There
-- is no Core row and no speculative future module grant.
with inserted_entitlements as (
  insert into public.company_module_entitlements (company_id, module_key, source)
  select company.id, 'planning', 'existing_tenant_bootstrap'
  from public.companies company
  on conflict (company_id, module_key) do nothing
  returning company_id, module_key, source
)
insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
select
  entitlement.company_id,
  null,
  'module_entitlement.granted',
  'company_module_entitlement',
  null,
  jsonb_build_object('module_key', entitlement.module_key, 'source', entitlement.source)
from inserted_entitlements entitlement;

create or replace function public.audit_company_module_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
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

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    auth.uid(),
    audit_action,
    'company_module_entitlement',
    null,
    jsonb_build_object('module_key', new.module_key, 'source', new.source)
  );
  return new;
end;
$$;

revoke all on function public.audit_company_module_entitlement_change()
  from public, anon, authenticated, service_role;

create trigger company_module_entitlements_audit
after insert or update on public.company_module_entitlements
for each row execute function public.audit_company_module_entitlement_change();

-- Planning is the first gated module. The integrity and audit triggers remain
-- untouched; only its existing member/role policies gain the module condition.
drop policy if exists "planning members read events" on public.planning_events;
drop policy if exists "planning managers create events" on public.planning_events;
drop policy if exists "planning managers update events" on public.planning_events;

create policy "planning members read events"
on public.planning_events for select to authenticated
using (
  (select public.is_company_member(company_id))
  and public.has_company_module(company_id, 'planning')
);

create policy "planning managers create events"
on public.planning_events for insert to authenticated
with check (
  public.has_company_module(company_id, 'planning')
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
);

create policy "planning managers update events"
on public.planning_events for update to authenticated
using (
  public.has_company_module(company_id, 'planning')
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
)
with check (
  public.has_company_module(company_id, 'planning')
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
);
