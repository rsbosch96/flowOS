-- WP7.2A: immutable, tenant-scoped invoice records with atomic numbering.
-- Apply together with the matching application release. This migration never deletes
-- or backfills existing invoices from mutable company/customer records.

alter table public.companies add column if not exists iban text;

alter table public.invoices
  add column if not exists invoice_date date,
  add column if not exists due_date date,
  add column if not exists sent_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists company_name text,
  add column if not exists company_address text,
  add column if not exists company_postal_code text,
  add column if not exists company_city text,
  add column if not exists company_country text,
  add column if not exists company_kvk text,
  add column if not exists company_vat_number text,
  add column if not exists company_iban text,
  add column if not exists company_email text,
  add column if not exists company_phone text,
  add column if not exists customer_name text,
  add column if not exists customer_address text,
  add column if not exists customer_postal_code text,
  add column if not exists customer_city text,
  add column if not exists customer_country text,
  add column if not exists customer_email text;

create table if not exists public.invoice_number_counters (
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year integer not null check (fiscal_year between 2000 and 9999),
  next_number bigint not null check (next_number > 0),
  primary key (company_id, fiscal_year)
);
alter table public.invoice_number_counters enable row level security;

-- Preserve existing issued numbers when the historical format is recognised. Existing
-- invoices are deliberately not populated with live company/customer data.
insert into public.invoice_number_counters (company_id, fiscal_year, next_number)
select
  company_id,
  (substring(invoice_number from '^F-([0-9]{4})-[0-9]+$'))::integer,
  max((substring(invoice_number from '^F-[0-9]{4}-([0-9]+)$'))::bigint) + 1
from public.invoices
where invoice_number ~ '^F-[0-9]{4}-[0-9]+$'
group by company_id, substring(invoice_number from '^F-([0-9]{4})-[0-9]+$')
on conflict (company_id, fiscal_year) do update
set next_number = greatest(public.invoice_number_counters.next_number, excluded.next_number);

drop policy if exists "tenant invoices" on public.invoices;
drop policy if exists "tenant invoice items" on public.invoice_items;
create policy "tenant invoices read" on public.invoices
  for select to authenticated using (public.is_company_member(company_id));
create policy "tenant invoice items read" on public.invoice_items
  for select to authenticated using (
    exists (select 1 from public.invoices i where i.id = invoice_id and public.is_company_member(i.company_id))
  );

-- Browser clients cannot forge audit entries. Server routes now use the service-role helper;
-- customer decisions and invoice events are inserted inside controlled SECURITY DEFINER RPCs.
drop policy if exists "members insert audit logs" on public.audit_logs;

create or replace function public.prevent_invoice_content_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - array['status', 'sent_at', 'paid_at', 'voided_at', 'void_reason', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['status', 'sent_at', 'paid_at', 'voided_at', 'void_reason', 'updated_at']) then
    raise exception 'Invoice content is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_invoice_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Invoices cannot be hard-deleted; void the invoice instead';
end;
$$;

create or replace function public.prevent_invoice_item_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Invoice items are immutable';
end;
$$;

drop trigger if exists invoices_content_immutable on public.invoices;
create trigger invoices_content_immutable before update on public.invoices
  for each row execute function public.prevent_invoice_content_mutation();
drop trigger if exists invoices_no_delete on public.invoices;
create trigger invoices_no_delete before delete on public.invoices
  for each row execute function public.prevent_invoice_delete();
drop trigger if exists invoice_items_immutable on public.invoice_items;
create trigger invoice_items_immutable before update or delete on public.invoice_items
  for each row execute function public.prevent_invoice_item_mutation();

revoke all on function public.create_invoice_from_quote(uuid) from public, authenticated;
drop function if exists public.create_invoice_from_quote(uuid);

create function public.create_invoice_from_quote(
  target_quote_id uuid,
  target_company_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_record public.quotes%rowtype;
  company_record public.companies%rowtype;
  customer_record public.customers%rowtype;
  new_invoice_id uuid;
  fiscal_year integer := extract(year from current_date)::integer;
  allocated_number bigint;
  invoice_number_value text;
begin
  if auth.uid() is null
    or not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed';
  end if;

  select * into quote_record from public.quotes
  where id = target_quote_id and company_id = target_company_id
  for update;
  if not found then raise exception 'Quote not found for this company'; end if;
  if quote_record.status <> 'accepted' then raise exception 'Only accepted quotes can be invoiced'; end if;

  select id into new_invoice_id from public.invoices where quote_id = quote_record.id;
  if found then return new_invoice_id; end if;

  select * into company_record from public.companies where id = target_company_id;
  select * into customer_record from public.customers
  where id = quote_record.customer_id and company_id = target_company_id;
  if not found then raise exception 'Customer not found for this company'; end if;

  insert into public.invoice_number_counters (company_id, fiscal_year, next_number)
  values (target_company_id, fiscal_year, 2)
  on conflict (company_id, fiscal_year) do update
  set next_number = public.invoice_number_counters.next_number + 1
  returning next_number - 1 into allocated_number;

  -- Counter allocation and invoice insertion share this transaction: a full rollback
  -- also rolls back the counter increment, so failed creations do not create gaps.
  -- A successfully allocated number remains reserved forever, including after voiding.

  invoice_number_value := 'F-' || fiscal_year::text || '-' || lpad(allocated_number::text, greatest(4, char_length(allocated_number::text)), '0');

  insert into public.invoices (
    company_id, customer_id, quote_id, invoice_number, status, currency,
    subtotal_cents, tax_cents, total_cents, notes, due_at, due_date, invoice_date, created_by,
    company_name, company_address, company_postal_code, company_city, company_country,
    company_kvk, company_vat_number, company_iban, company_email, company_phone,
    customer_name, customer_address, customer_postal_code, customer_city, customer_country, customer_email
  ) values (
    target_company_id, customer_record.id, quote_record.id, invoice_number_value, 'draft', quote_record.currency,
    quote_record.subtotal_cents, quote_record.tax_cents, quote_record.total_cents, quote_record.notes,
    current_date + 14, current_date + 14, current_date, auth.uid(),
    company_record.name, company_record.address ->> 'street', company_record.address ->> 'postal_code', company_record.address ->> 'city', company_record.address ->> 'country',
    company_record.kvk_number, company_record.vat_number, coalesce(company_record.iban, company_record.settings ->> 'iban'), company_record.email, company_record.phone,
    customer_record.name, customer_record.address ->> 'street', customer_record.address ->> 'postal_code', customer_record.address ->> 'city', customer_record.address ->> 'country', customer_record.email
  ) returning id into new_invoice_id;

  insert into public.invoice_items (invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents)
  select new_invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents
  from public.quote_items where quote_id = quote_record.id order by position;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_company_id, auth.uid(), 'invoice.created_from_quote', 'invoice', new_invoice_id, jsonb_build_object('quote_id', quote_record.id));

  return new_invoice_id;
end;
$$;

create or replace function public.transition_invoice_status(
  target_invoice_id uuid,
  target_company_id uuid,
  target_status text,
  requested_void_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record public.invoices%rowtype;
  audit_action text;
begin
  if auth.uid() is null
    or not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed';
  end if;

  select * into invoice_record from public.invoices
  where id = target_invoice_id and company_id = target_company_id
  for update;
  if not found then raise exception 'Invoice not found for this company'; end if;

  if (invoice_record.status = 'draft' and target_status = 'sent')
    or (invoice_record.status in ('sent', 'overdue') and target_status = 'paid') then
    audit_action := case when target_status = 'sent' then 'invoice.sent' else 'invoice.paid' end;
    update public.invoices set status = target_status,
      sent_at = case when target_status = 'sent' then now() else sent_at end,
      paid_at = case when target_status = 'paid' then now() else paid_at end,
      updated_at = now()
    where id = invoice_record.id;
  elsif invoice_record.status in ('draft', 'sent', 'overdue') and target_status = 'void' then
    if coalesce(char_length(btrim(requested_void_reason)), 0) < 2 or char_length(btrim(requested_void_reason)) > 1000 then
      raise exception 'A void reason is required';
    end if;
    audit_action := 'invoice.voided';
    update public.invoices set status = 'void', voided_at = now(), void_reason = btrim(requested_void_reason), updated_at = now()
    where id = invoice_record.id;
  else
    raise exception 'Invalid invoice status transition';
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_company_id, auth.uid(), audit_action, 'invoice', invoice_record.id,
    jsonb_build_object('previous_status', invoice_record.status, 'new_status', target_status));
  return true;
end;
$$;

revoke all on function public.create_invoice_from_quote(uuid, uuid) from public;
revoke all on function public.transition_invoice_status(uuid, uuid, text, text) from public;
grant execute on function public.create_invoice_from_quote(uuid, uuid) to authenticated;
grant execute on function public.transition_invoice_status(uuid, uuid, text, text) to authenticated;
