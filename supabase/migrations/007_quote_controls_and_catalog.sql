-- Offerte Engine 2.0: catalogus, templates en harde goedkeuringsregels.
create table public.product_catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  unit text not null default 'stuk',
  default_unit_price_cents bigint not null check (default_unit_price_cents >= 0),
  default_vat_rate numeric(5,2) not null default 21 check (default_vat_rate between 0 and 100),
  cost_price_cents bigint check (cost_price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);
create index product_catalog_company_active_idx on public.product_catalog_items(company_id, is_active);

create table public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  document_title text not null default 'Offerte',
  intro_text text,
  closing_text text,
  accent_color text not null default '#2563EB' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_storage_path text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create unique index quote_templates_one_default_per_company on public.quote_templates(company_id) where is_default;

create table public.quote_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  approval_threshold_cents bigint not null default 500000 check (approval_threshold_cents >= 0),
  min_margin_percentage numeric(5,2) check (min_margin_percentage between 0 and 100),
  require_owner_above_threshold boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_catalog_items enable row level security;
alter table public.quote_templates enable row level security;
alter table public.quote_approval_rules enable row level security;
create policy "tenant product catalog" on public.product_catalog_items for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "tenant quote templates" on public.quote_templates for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "members read approval rules" on public.quote_approval_rules for select to authenticated using (public.is_company_member(company_id));
create policy "owners manage approval rules" on public.quote_approval_rules for all to authenticated using (public.has_company_role(company_id, array['owner']::public.company_role[])) with check (public.has_company_role(company_id, array['owner']::public.company_role[]));

create or replace function public.create_company_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.quote_approval_rules (company_id) values (new.id) on conflict (company_id) do nothing;
  insert into public.quote_templates (company_id, name, is_default) values (new.id, 'Standaard offerte', true) on conflict (company_id, name) do nothing;
  return new;
end;
$$;
create trigger create_company_quote_defaults after insert on public.companies for each row execute function public.create_company_defaults();

-- Create defaults for organizations that already exist.
insert into public.quote_approval_rules (company_id) select id from public.companies on conflict (company_id) do nothing;
insert into public.quote_templates (company_id, name, is_default) select id, 'Standaard offerte', true from public.companies on conflict (company_id, name) do nothing;
