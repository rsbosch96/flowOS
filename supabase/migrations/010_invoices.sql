-- Invoice records are deliberately separate from quotes: a later change to a quote
-- can never silently alter an already created invoice.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  quote_id uuid unique references public.quotes(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  currency char(3) not null default 'EUR',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  due_at date,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, invoice_number), check (total_cents = subtotal_cents + tax_cents)
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null check (position > 0), description text not null, quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'stuk', unit_price_cents bigint not null check (unit_price_cents >= 0),
  vat_rate numeric(5,2) not null default 21 check (vat_rate between 0 and 100), line_total_cents bigint not null check (line_total_cents >= 0), unique (invoice_id, position)
);
create index invoices_company_status_idx on public.invoices(company_id, status);
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
create policy "tenant invoices" on public.invoices for all to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "tenant invoice items" on public.invoice_items for all to authenticated using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_company_member(i.company_id))) with check (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_company_member(i.company_id)));

create or replace function public.create_invoice_from_quote(target_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.quotes%rowtype; new_invoice_id uuid; number_suffix text;
begin
  select * into q from public.quotes where id = target_quote_id;
  if not found or auth.uid() is null or not public.has_company_role(q.company_id, array['owner','employee']::public.company_role[]) then raise exception 'Not allowed'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotes can be invoiced'; end if;
  select id into new_invoice_id from public.invoices where quote_id = q.id;
  if found then return new_invoice_id; end if;
  number_suffix := to_char(now(), 'YYYY') || '-' || lpad((select (count(*) + 1)::text from public.invoices where company_id = q.company_id and date_part('year', created_at) = date_part('year', now())), 4, '0');
  insert into public.invoices (company_id, customer_id, quote_id, invoice_number, subtotal_cents, tax_cents, total_cents, notes, due_at, created_by)
    values (q.company_id, q.customer_id, q.id, 'F-' || number_suffix, q.subtotal_cents, q.tax_cents, q.total_cents, q.notes, current_date + 14, auth.uid()) returning id into new_invoice_id;
  insert into public.invoice_items (invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents)
    select new_invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents from public.quote_items where quote_id = q.id order by position;
  return new_invoice_id;
end;
$$;
revoke all on function public.create_invoice_from_quote(uuid) from public;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
