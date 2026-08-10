-- WP7.2B.1: block new invoices until the mandatory Dutch party details are complete.
-- Existing invoices remain untouched and the existing function signature/permissions stay intact.

create or replace function public.create_invoice_from_quote(
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
  target_fiscal_year integer := extract(year from current_date)::integer;
  allocated_number bigint;
  invoice_number_value text;
  missing_fields text[] := array[]::text[];
  company_iban_value text;
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

  -- Preserve idempotency for invoices that were already issued. Their immutable
  -- snapshots must stay retrievable even if the live company/customer profile changes later.
  select id into new_invoice_id from public.invoices where quote_id = quote_record.id;
  if found then return new_invoice_id; end if;

  select * into company_record from public.companies where id = target_company_id;
  if not found then raise exception 'Company not found'; end if;

  select * into customer_record from public.customers
  where id = quote_record.customer_id and company_id = target_company_id;
  if not found then raise exception 'Customer not found for this company'; end if;

  company_iban_value := coalesce(company_record.iban, company_record.settings ->> 'iban');

  if coalesce(nullif(btrim(company_record.name), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_name'); end if;
  if coalesce(nullif(btrim(company_record.kvk_number), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_kvk'); end if;
  if coalesce(nullif(btrim(company_record.vat_number), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_vat_number'); end if;
  if coalesce(nullif(btrim(company_iban_value), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_iban'); end if;
  if coalesce(nullif(btrim(company_record.address ->> 'street'), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_street'); end if;
  if coalesce(nullif(btrim(company_record.address ->> 'postal_code'), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_postal_code'); end if;
  if coalesce(nullif(btrim(company_record.address ->> 'city'), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_city'); end if;
  if coalesce(nullif(btrim(company_record.address ->> 'country'), ''), '') = '' then missing_fields := array_append(missing_fields, 'company_country'); end if;

  if coalesce(nullif(btrim(customer_record.name), ''), '') = '' then missing_fields := array_append(missing_fields, 'customer_name'); end if;
  if coalesce(nullif(btrim(customer_record.address ->> 'street'), ''), '') = '' then missing_fields := array_append(missing_fields, 'customer_street'); end if;
  if coalesce(nullif(btrim(customer_record.address ->> 'postal_code'), ''), '') = '' then missing_fields := array_append(missing_fields, 'customer_postal_code'); end if;
  if coalesce(nullif(btrim(customer_record.address ->> 'city'), ''), '') = '' then missing_fields := array_append(missing_fields, 'customer_city'); end if;
  if coalesce(nullif(btrim(customer_record.address ->> 'country'), ''), '') = '' then missing_fields := array_append(missing_fields, 'customer_country'); end if;

  if cardinality(missing_fields) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVOICE_PARTY_DETAILS_MISSING',
      detail = array_to_string(missing_fields, ',');
  end if;

  insert into public.invoice_number_counters as counters (company_id, fiscal_year, next_number)
  values (target_company_id, target_fiscal_year, 2)
  on conflict on constraint invoice_number_counters_pkey do update
  set next_number = counters.next_number + 1
  returning counters.next_number - 1 into allocated_number;

  -- Counter allocation and invoice insertion share this transaction: a full rollback
  -- also rolls back the counter increment, so failed creations do not create gaps.
  -- A successfully allocated number remains reserved forever, including after voiding.

  invoice_number_value := 'F-' || target_fiscal_year::text || '-' || lpad(allocated_number::text, greatest(4, char_length(allocated_number::text)), '0');

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
    company_record.kvk_number, company_record.vat_number, company_iban_value, company_record.email, company_record.phone,
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
