-- RC1: atomically create an AI draft for an already validated conversation customer.
-- The existing six-argument free-input contract remains compatible and is hardened below.

create or replace function public.create_ai_quote_draft(
  target_company_id uuid,
  target_customer_id uuid,
  draft_title text,
  draft_notes text,
  draft_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_customer public.customers%rowtype;
  new_quote_id uuid;
  item jsonb;
  catalog_item public.product_catalog_items%rowtype;
  requested_catalog_item_id uuid;
  item_quantity numeric(12,3);
  item_total_cents bigint;
  subtotal bigint := 0;
  tax bigint := 0;
  item_position integer := 0;
begin
  if auth.uid() is null or not public.is_company_member(target_company_id) then
    raise exception 'Not allowed for this company';
  end if;
  if exists (
    select 1 from public.company_memberships
    where company_id = target_company_id and user_id = auth.uid() and role = 'technician'
  ) then
    raise exception 'Technicians cannot create quote drafts';
  end if;
  if coalesce(char_length(btrim(draft_title)), 0) < 3 or char_length(btrim(draft_title)) > 160 then
    raise exception 'Invalid quote draft';
  end if;
  if draft_notes is not null and char_length(draft_notes) > 5000 then
    raise exception 'Invalid quote notes';
  end if;
  if jsonb_typeof(draft_items) <> 'array' or jsonb_array_length(draft_items) = 0 or jsonb_array_length(draft_items) > 100 then
    raise exception 'Invalid quote items';
  end if;

  select * into existing_customer
  from public.customers
  where id = target_customer_id and company_id = target_company_id;
  if not found then
    raise exception 'Customer not found for this company';
  end if;

  insert into public.quotes (company_id, customer_id, quote_number, title, notes, created_by)
  values (
    target_company_id,
    existing_customer.id,
    'CON-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
    btrim(draft_title),
    draft_notes,
    auth.uid()
  )
  returning id into new_quote_id;

  for item in select value from jsonb_array_elements(draft_items)
  loop
    item_position := item_position + 1;
    if coalesce(jsonb_typeof(item->'description'), '') <> 'string'
      or coalesce(jsonb_typeof(item->'quantity'), '') <> 'number'
      or nullif(item->>'catalogItemId', '') is null then
      raise exception 'Invalid catalog quote item';
    end if;
    if coalesce(char_length(btrim(item->>'description')), 0) < 2 or char_length(btrim(item->>'description')) > 500 then
      raise exception 'Invalid quote item description';
    end if;
    item_quantity := (item->>'quantity')::numeric(12,3);
    if item_quantity <= 0 or item_quantity > 100000 then
      raise exception 'Invalid quote item quantity';
    end if;

    requested_catalog_item_id := (item->>'catalogItemId')::uuid;
    select * into catalog_item
    from public.product_catalog_items
    where id = requested_catalog_item_id and company_id = target_company_id and is_active = true;
    if not found then
      raise exception 'Catalog item is unavailable';
    end if;

    item_total_cents := round(item_quantity * catalog_item.default_unit_price_cents)::bigint;
    subtotal := subtotal + item_total_cents;
    tax := tax + round(item_total_cents * catalog_item.default_vat_rate / 100)::bigint;

    insert into public.quote_items (
      quote_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents
    ) values (
      new_quote_id, item_position, catalog_item.name, item_quantity,
      catalog_item.unit, catalog_item.default_unit_price_cents, catalog_item.default_vat_rate, item_total_cents
    );
  end loop;

  update public.quotes
  set subtotal_cents = subtotal,
      tax_cents = tax,
      total_cents = subtotal + tax,
      updated_at = now()
  where id = new_quote_id and company_id = target_company_id;

  return new_quote_id;
end;
$$;

-- Keep free input compatible while making its catalog-only rules identical. If the
-- nested customer-backed call fails, PostgreSQL rolls back the newly created customer too.
create or replace function public.create_ai_quote_draft(
  target_company_id uuid,
  customer_name text,
  customer_email text,
  draft_title text,
  draft_notes text,
  draft_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_customer_id uuid;
begin
  if auth.uid() is null or not public.is_company_member(target_company_id) then
    raise exception 'Not allowed for this company';
  end if;
  if exists (
    select 1 from public.company_memberships
    where company_id = target_company_id and user_id = auth.uid() and role = 'technician'
  ) then
    raise exception 'Technicians cannot create quote drafts';
  end if;
  if coalesce(char_length(btrim(customer_name)), 0) < 2 or char_length(btrim(customer_name)) > 160 then
    raise exception 'Invalid customer';
  end if;

  insert into public.customers (company_id, name, email, created_by)
  values (target_company_id, btrim(customer_name), nullif(btrim(customer_email), ''), auth.uid())
  returning id into new_customer_id;

  return public.create_ai_quote_draft(
    target_company_id,
    new_customer_id,
    draft_title,
    draft_notes,
    draft_items
  );
end;
$$;

revoke all on function public.create_ai_quote_draft(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_ai_quote_draft(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) to authenticated;
