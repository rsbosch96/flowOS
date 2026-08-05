-- WP5.1: atomically replace the editable snapshot of a draft quote.
-- All validation and money calculations happen inside this transaction.

create or replace function public.update_draft_quote(
  target_company_id uuid,
  target_quote_id uuid,
  draft_title text,
  draft_notes text,
  draft_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_record public.quotes%rowtype;
  item jsonb;
  item_position integer := 0;
  item_description text;
  item_quantity numeric;
  item_unit text;
  item_price_cents numeric;
  item_vat_rate numeric;
  item_total_numeric numeric;
  item_total_cents bigint;
  subtotal_numeric numeric := 0;
  tax_numeric numeric := 0;
  calculated_subtotal_cents bigint;
  calculated_tax_cents bigint;
  vat_subtotals jsonb := '{}'::jsonb;
  vat_entry record;
  max_bigint constant numeric := 9223372036854775807;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed for this company';
  end if;

  select * into quote_record
  from public.quotes
  where id = target_quote_id
    and company_id = target_company_id
  for update;

  if not found then
    raise exception 'Quote not found for this company';
  end if;

  if quote_record.status <> 'draft' then
    raise exception 'Only draft quotes can be updated';
  end if;

  if coalesce(char_length(btrim(draft_title)), 0) < 3 or char_length(btrim(draft_title)) > 160 then
    raise exception 'Invalid quote title';
  end if;

  if draft_notes is not null and char_length(draft_notes) > 5000 then
    raise exception 'Invalid quote notes';
  end if;

  if coalesce(jsonb_typeof(draft_items), '') <> 'array'
    or jsonb_array_length(draft_items) = 0
    or jsonb_array_length(draft_items) > 100 then
    raise exception 'Invalid quote items';
  end if;

  for item in select value from jsonb_array_elements(draft_items)
  loop
    item_position := item_position + 1;

    if coalesce(jsonb_typeof(item->'description'), '') <> 'string'
      or coalesce(jsonb_typeof(item->'quantity'), '') <> 'number'
      or coalesce(jsonb_typeof(item->'unit'), '') <> 'string'
      or coalesce(jsonb_typeof(item->'unitPriceCents'), '') <> 'number'
      or coalesce(jsonb_typeof(item->'vatRate'), '') <> 'number' then
      raise exception 'Invalid quote item';
    end if;

    item_description := btrim(item->>'description');
    item_unit := btrim(item->>'unit');
    item_quantity := (item->>'quantity')::numeric;
    item_price_cents := (item->>'unitPriceCents')::numeric;
    item_vat_rate := (item->>'vatRate')::numeric;

    if coalesce(char_length(item_description), 0) < 2 or char_length(item_description) > 500
      or coalesce(char_length(item_unit), 0) = 0 or char_length(item_unit) > 30
      or item_quantity <= 0 or item_quantity > 100000 or item_quantity <> round(item_quantity, 3)
      or item_price_cents < 0 or item_price_cents <> trunc(item_price_cents) or item_price_cents > max_bigint
      or item_vat_rate < 0 or item_vat_rate > 100 or item_vat_rate <> round(item_vat_rate, 2) then
      raise exception 'Invalid quote item';
    end if;

    item_total_numeric := round(item_quantity * item_price_cents);
    if item_total_numeric > max_bigint then
      raise exception 'Quote item total is too large';
    end if;

    item_total_cents := item_total_numeric::bigint;
    subtotal_numeric := subtotal_numeric + item_total_numeric;
    if subtotal_numeric > max_bigint then
      raise exception 'Quote subtotal is too large';
    end if;

    vat_subtotals := jsonb_set(
      vat_subtotals,
      array[item_vat_rate::text],
      to_jsonb(coalesce((vat_subtotals ->> item_vat_rate::text)::numeric, 0) + item_total_numeric),
      true
    );
  end loop;

  for vat_entry in select key, value from jsonb_each_text(vat_subtotals)
  loop
    tax_numeric := tax_numeric + round((vat_entry.value)::numeric * (vat_entry.key)::numeric / 100);
    if tax_numeric > max_bigint then
      raise exception 'Quote tax is too large';
    end if;
  end loop;

  if subtotal_numeric + tax_numeric > max_bigint then
    raise exception 'Quote total is too large';
  end if;

  calculated_subtotal_cents := subtotal_numeric::bigint;
  calculated_tax_cents := tax_numeric::bigint;

  -- An unhandled error in this function rolls back the update, delete and insert together.
  delete from public.quote_items where quote_id = target_quote_id;

  item_position := 0;
  for item in select value from jsonb_array_elements(draft_items)
  loop
    item_position := item_position + 1;
    item_quantity := (item->>'quantity')::numeric;
    item_price_cents := (item->>'unitPriceCents')::numeric;
    item_vat_rate := (item->>'vatRate')::numeric;

    insert into public.quote_items (
      quote_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents
    ) values (
      target_quote_id,
      item_position,
      btrim(item->>'description'),
      item_quantity,
      btrim(item->>'unit'),
      item_price_cents::bigint,
      item_vat_rate,
      round(item_quantity * item_price_cents)::bigint
    );
  end loop;

  update public.quotes
  set title = btrim(draft_title),
      notes = draft_notes,
      subtotal_cents = calculated_subtotal_cents,
      tax_cents = calculated_tax_cents,
      total_cents = calculated_subtotal_cents + calculated_tax_cents,
      updated_at = now()
  where id = target_quote_id
    and company_id = target_company_id
    and status = 'draft';

  return jsonb_build_object(
    'quoteId', target_quote_id,
    'subtotalCents', calculated_subtotal_cents,
    'taxCents', calculated_tax_cents,
    'totalCents', calculated_subtotal_cents + calculated_tax_cents
  );
end;
$$;

revoke all on function public.update_draft_quote(uuid, uuid, text, text, jsonb) from public;
grant execute on function public.update_draft_quote(uuid, uuid, text, text, jsonb) to authenticated;
