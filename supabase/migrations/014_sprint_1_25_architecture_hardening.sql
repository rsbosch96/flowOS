-- RSTECH-TASK-002: Gateway ownership, one AI-run completion signature and atomic AI quote storage.

alter table public.ai_runs add column if not exists duration_ms integer check (duration_ms >= 0);
alter table public.ai_runs add column if not exists total_tokens integer check (total_tokens >= 0);
alter table public.ai_runs add column if not exists error_message text;
alter table public.ai_runs add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Direct browser writes are deliberately removed. Only the server-side AI Gateway may mutate runs.
drop policy if exists "tenant ai runs insert" on public.ai_runs;
drop policy if exists "tenant ai runs update" on public.ai_runs;

-- Remove every historical overload before defining the one canonical completion function.
drop function if exists public.start_ai_run(uuid, text, text);
drop function if exists public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text);
drop function if exists public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text, integer, integer, text, jsonb);

create function public.start_ai_run(
  target_company_id uuid,
  target_initiated_by uuid,
  requested_kind text,
  requested_prompt_version text,
  requested_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_run_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Only the AI Gateway may create AI runs'; end if;
  if not exists (select 1 from public.company_memberships where company_id = target_company_id and user_id = target_initiated_by) then
    raise exception 'Initiator is not a member of this company';
  end if;
  if requested_kind not in ('document_extraction', 'quote_generation', 'reply_draft') then raise exception 'Invalid AI job type'; end if;
  if jsonb_typeof(requested_metadata) <> 'object' then raise exception 'AI metadata must be an object'; end if;

  insert into public.ai_runs (company_id, initiated_by, kind, status, prompt_version, metadata, started_at)
  values (target_company_id, target_initiated_by, requested_kind, 'running', requested_prompt_version, requested_metadata, now())
  returning id into new_run_id;
  return new_run_id;
end;
$$;

create function public.finish_ai_run(
  target_run_id uuid,
  new_status public.ai_run_status,
  target_quote_id uuid default null,
  provider_model text default null,
  provider_input_tokens integer default null,
  provider_output_tokens integer default null,
  provider_total_tokens integer default null,
  provider_duration_ms integer default null,
  failure_code text default null,
  safe_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Only the AI Gateway may finish AI runs'; end if;
  if new_status not in ('succeeded', 'failed') then raise exception 'Invalid AI completion status'; end if;

  update public.ai_runs
  set status = new_status,
      quote_id = coalesce(target_quote_id, quote_id),
      model = coalesce(provider_model, model),
      input_tokens = coalesce(provider_input_tokens, input_tokens),
      output_tokens = coalesce(provider_output_tokens, output_tokens),
      total_tokens = coalesce(provider_total_tokens, total_tokens),
      duration_ms = coalesce(provider_duration_ms, duration_ms),
      error_code = failure_code,
      error_message = safe_error_message,
      finished_at = now()
  where id = target_run_id;

  if not found then raise exception 'AI run not found'; end if;
end;
$$;

revoke all on function public.start_ai_run(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.start_ai_run(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, integer, integer, text, text) to service_role;

create function public.create_ai_quote_draft(
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
set search_path = public
as $$
declare
  new_customer_id uuid;
  new_quote_id uuid;
  item jsonb;
  catalog_item public.product_catalog_items%rowtype;
  requested_catalog_item_id uuid;
  item_quantity numeric(12,3);
  item_price_cents bigint;
  item_vat_rate numeric(5,2);
  item_unit text;
  item_total_cents bigint;
  subtotal bigint := 0;
  tax bigint := 0;
  item_position integer := 0;
begin
  if auth.uid() is null or not public.is_company_member(target_company_id) then raise exception 'Not allowed for this company'; end if;
  if exists (select 1 from public.company_memberships where company_id = target_company_id and user_id = auth.uid() and role = 'technician') then
    raise exception 'Technicians cannot create quote drafts';
  end if;
  if length(trim(customer_name)) < 2 or length(trim(draft_title)) < 3 then raise exception 'Invalid quote draft'; end if;
  if jsonb_typeof(draft_items) <> 'array' or jsonb_array_length(draft_items) = 0 or jsonb_array_length(draft_items) > 100 then
    raise exception 'Invalid quote items';
  end if;

  insert into public.customers (company_id, name, email, created_by)
  values (target_company_id, trim(customer_name), nullif(trim(customer_email), ''), auth.uid())
  returning id into new_customer_id;

  insert into public.quotes (company_id, customer_id, quote_number, title, notes, created_by)
  values (
    target_company_id,
    new_customer_id,
    'CON-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
    trim(draft_title),
    draft_notes,
    auth.uid()
  ) returning id into new_quote_id;

  for item in select value from jsonb_array_elements(draft_items)
  loop
    item_position := item_position + 1;
    if coalesce(length(trim(item->>'description')), 0) < 2 then raise exception 'Invalid quote item description'; end if;
    item_quantity := (item->>'quantity')::numeric(12,3);
    if item_quantity <= 0 then raise exception 'Invalid quote item quantity'; end if;

    if nullif(item->>'catalogItemId', '') is not null then
      requested_catalog_item_id := (item->>'catalogItemId')::uuid;
      select * into catalog_item from public.product_catalog_items
      where id = requested_catalog_item_id and company_id = target_company_id and is_active = true;
      if not found then raise exception 'Catalog item is unavailable'; end if;
      item_price_cents := catalog_item.default_unit_price_cents;
      item_vat_rate := catalog_item.default_vat_rate;
      item_unit := catalog_item.unit;
    else
      -- An unmatched AI proposal is intentionally price-free until a human edits the concept.
      item_price_cents := 0;
      item_vat_rate := 21;
      item_unit := left(coalesce(nullif(trim(item->>'unit'), ''), 'stuk'), 30);
    end if;

    item_total_cents := round(item_quantity * item_price_cents)::bigint;
    subtotal := subtotal + item_total_cents;
    tax := tax + round(item_total_cents * item_vat_rate / 100)::bigint;
    insert into public.quote_items (quote_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents)
    values (new_quote_id, item_position, trim(item->>'description'), item_quantity, item_unit, item_price_cents, item_vat_rate, item_total_cents);
  end loop;

  update public.quotes
  set subtotal_cents = subtotal, tax_cents = tax, total_cents = subtotal + tax, updated_at = now()
  where id = new_quote_id;
  return new_quote_id;
end;
$$;

revoke all on function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) to authenticated;
