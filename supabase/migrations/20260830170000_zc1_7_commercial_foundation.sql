-- ZC1.7: provider-neutral commercial foundation.
-- This migration does not provision subscriptions or change runtime entitlements.

create table if not exists public.commercial_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_plans_code_check check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint commercial_plans_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint commercial_plans_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists public.commercial_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.commercial_plans(id) on delete restrict,
  version integer not null,
  status text not null default 'active',
  billing_interval text not null,
  currency text not null,
  base_price_cents integer not null,
  included_seats integer not null,
  extra_seat_price_cents integer not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint commercial_plan_versions_plan_version_key unique (plan_id, version),
  constraint commercial_plan_versions_version_check check (version >= 1),
  constraint commercial_plan_versions_status_check check (status in ('active', 'inactive', 'archived')),
  constraint commercial_plan_versions_interval_check check (billing_interval in ('monthly', 'yearly')),
  constraint commercial_plan_versions_currency_check check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  constraint commercial_plan_versions_base_price_check check (base_price_cents >= 0),
  constraint commercial_plan_versions_included_seats_check check (included_seats >= 1),
  constraint commercial_plan_versions_extra_seat_price_check check (extra_seat_price_cents >= 0),
  constraint commercial_plan_versions_validity_check check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.commercial_plan_entitlements (
  plan_version_id uuid not null references public.commercial_plan_versions(id) on delete restrict,
  module_key text not null references public.module_catalog(module_key) on delete restrict,
  is_included boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (plan_version_id, module_key)
);

-- Reuse the existing subscriptions table as the sole company subscription
-- concept. New fields are nullable so existing legacy rows are never guessed
-- into a commercial contract.
alter table public.subscriptions
  add column if not exists plan_version_id uuid references public.commercial_plan_versions(id) on delete restrict,
  add column if not exists billing_provider text,
  add column if not exists currency text,
  add column if not exists billing_interval text,
  add column if not exists base_price_cents integer,
  add column if not exists included_seats integer,
  add column if not exists extra_seat_price_cents integer,
  add column if not exists current_period_start timestamptz,
  add column if not exists intro_price_until timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists is_primary boolean not null default true;

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_provider_check,
  drop constraint if exists subscriptions_currency_check,
  drop constraint if exists subscriptions_billing_interval_check,
  drop constraint if exists subscriptions_base_price_cents_check,
  drop constraint if exists subscriptions_included_seats_check,
  drop constraint if exists subscriptions_extra_seat_price_cents_check,
  drop constraint if exists subscriptions_contract_snapshot_check;

alter table public.subscriptions
  add constraint subscriptions_billing_provider_check
    check (billing_provider is null or billing_provider in ('manual', 'stripe')),
  add constraint subscriptions_currency_check
    check (currency is null or (currency = upper(currency) and currency ~ '^[A-Z]{3}$')),
  add constraint subscriptions_billing_interval_check
    check (billing_interval is null or billing_interval in ('monthly', 'yearly')),
  add constraint subscriptions_base_price_cents_check
    check (base_price_cents is null or base_price_cents >= 0),
  add constraint subscriptions_included_seats_check
    check (included_seats is null or included_seats >= 1),
  add constraint subscriptions_extra_seat_price_cents_check
    check (extra_seat_price_cents is null or extra_seat_price_cents >= 0),
  add constraint subscriptions_contract_snapshot_check
    check (
      plan_version_id is null
      or (
        billing_provider is not null
        and currency is not null
        and billing_interval is not null
        and base_price_cents is not null
        and included_seats is not null
        and extra_seat_price_cents is not null
        and current_period_start is not null
      )
    );

-- The legacy unique company constraint prevented retaining cancelled history.
-- The partial index preserves one current/access-bearing primary contract.
alter table public.subscriptions drop constraint if exists subscriptions_company_id_key;
create unique index if not exists subscriptions_one_current_primary_per_company_idx
  on public.subscriptions(company_id)
  where is_primary and status in (
    'trialing'::public.subscription_status,
    'active'::public.subscription_status,
    'past_due'::public.subscription_status,
    'grace_period'::public.subscription_status,
    'suspended'::public.subscription_status
  );
create index if not exists subscriptions_company_status_idx
  on public.subscriptions(company_id, status, updated_at desc);

create table if not exists public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  item_type text not null,
  item_code text not null,
  quantity integer not null,
  unit_price_cents integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_items_type_check check (item_type in ('seat', 'module', 'addon')),
  constraint subscription_items_code_check check (item_code ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint subscription_items_quantity_check check (quantity > 0),
  constraint subscription_items_price_check check (unit_price_cents is null or unit_price_cents >= 0),
  constraint subscription_items_status_check check (status in ('active', 'cancelled', 'removed'))
);

create index if not exists subscription_items_subscription_idx
  on public.subscription_items(subscription_id, status);

create or replace function public.prevent_referenced_plan_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.subscriptions subscription
    where subscription.plan_version_id = old.id
  ) and (
    new.plan_id is distinct from old.plan_id
    or new.version is distinct from old.version
    or new.billing_interval is distinct from old.billing_interval
    or new.currency is distinct from old.currency
    or new.base_price_cents is distinct from old.base_price_cents
    or new.included_seats is distinct from old.included_seats
    or new.extra_seat_price_cents is distinct from old.extra_seat_price_cents
    or new.valid_from is distinct from old.valid_from
    or new.valid_until is distinct from old.valid_until
  ) then
    raise exception 'COMMERCIAL_PLAN_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_referenced_plan_version_mutation() from public, anon, authenticated, service_role;
drop trigger if exists commercial_plan_version_immutability on public.commercial_plan_versions;
create trigger commercial_plan_version_immutability
before update on public.commercial_plan_versions
for each row execute function public.prevent_referenced_plan_version_mutation();

alter table public.commercial_plans enable row level security;
alter table public.commercial_plan_versions enable row level security;
alter table public.commercial_plan_entitlements enable row level security;
alter table public.subscription_items enable row level security;

revoke all on table public.commercial_plans from public, anon, authenticated, service_role;
revoke all on table public.commercial_plan_versions from public, anon, authenticated, service_role;
revoke all on table public.commercial_plan_entitlements from public, anon, authenticated, service_role;
revoke all on table public.subscription_items from public, anon, authenticated, service_role;

grant select on table public.commercial_plans to anon, authenticated;
grant select on table public.commercial_plan_versions to anon, authenticated;
grant select on table public.commercial_plan_entitlements to anon, authenticated;
grant select on table public.subscription_items to authenticated;
grant select on table public.commercial_plans, public.commercial_plan_versions, public.commercial_plan_entitlements, public.subscription_items to service_role;
grant insert, update, delete on table public.commercial_plans, public.commercial_plan_versions, public.commercial_plan_entitlements, public.subscription_items to service_role;

drop policy if exists "public read commercial plans" on public.commercial_plans;
create policy "public read commercial plans"
on public.commercial_plans for select to anon, authenticated using (true);

drop policy if exists "public read commercial plan versions" on public.commercial_plan_versions;
create policy "public read commercial plan versions"
on public.commercial_plan_versions for select to anon, authenticated using (true);

drop policy if exists "public read commercial plan entitlements" on public.commercial_plan_entitlements;
create policy "public read commercial plan entitlements"
on public.commercial_plan_entitlements for select to anon, authenticated using (true);

drop policy if exists "owners read subscription items" on public.subscription_items;
create policy "owners read subscription items"
on public.subscription_items for select to authenticated
using (
  exists (
    select 1
    from public.subscriptions subscription
    where subscription.id = subscription_id
      and public.has_company_role(subscription.company_id, array['owner']::public.company_role[])
  )
);

-- Deterministic, idempotent catalog seed only. No company is provisioned.
insert into public.commercial_plans (code, name, status)
values ('early_access', 'FlowOS Early Access', 'active')
on conflict (code) do nothing;

insert into public.commercial_plan_versions (
  plan_id, version, status, billing_interval, currency,
  base_price_cents, included_seats, extra_seat_price_cents, valid_from
)
select id, 1, 'active', 'monthly', 'EUR', 4900, 3, 900, now()
from public.commercial_plans
where code = 'early_access'
on conflict (plan_id, version) do nothing;

insert into public.commercial_plan_entitlements (plan_version_id, module_key, is_included)
select version.id, 'planning', true
from public.commercial_plan_versions version
join public.commercial_plans plan on plan.id = version.plan_id
where plan.code = 'early_access' and version.version = 1
on conflict (plan_version_id, module_key) do nothing;
