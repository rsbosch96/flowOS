-- WP6.1A: reset development links, use hash-only public tokens and record quote deliveries.
-- Apply this migration and the matching application release in one maintenance window.

alter table public.quotes
  add column if not exists public_token_hash text unique,
  add column if not exists public_token_revoked_at timestamptz;

-- Pilot reset approved by the CEO: invalidate every existing raw or hashed public link.
-- public_token remains temporarily as a deprecated nullable column for schema-safe rollout,
-- but no new application or RPC flow reads or writes it.
update public.quotes
set public_token = null,
    public_token_hash = null,
    public_token_expires_at = null,
    public_token_revoked_at = now()
where public_token is not null or public_token_hash is not null;

create table if not exists public.quote_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  delivery_type text not null check (delivery_type in ('initial', 'reminder')),
  recipient_email text not null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  idempotency_key uuid not null,
  provider text not null default 'resend',
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint quote_email_deliveries_quote_delivery_idempotency_key
    unique (quote_id, delivery_type, idempotency_key)
);

create index if not exists quote_email_deliveries_company_created_idx
  on public.quote_email_deliveries(company_id, created_at desc);

alter table public.quote_email_deliveries enable row level security;
create policy "tenant quote email deliveries read" on public.quote_email_deliveries
  for select to authenticated
  using (public.is_company_member(company_id));

create or replace function public.hash_public_quote_token(raw_token text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select encode(extensions.digest(raw_token::text, 'sha256'::text), 'hex')
$$;

create or replace function public.publish_quote_for_customer(
  target_quote_id uuid,
  target_company_id uuid,
  expiry_days integer default 30
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_token text;
  target_quote public.quotes%rowtype;
begin
  if auth.uid() is null
    or not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed';
  end if;

  select * into target_quote
  from public.quotes
  where id = target_quote_id and company_id = target_company_id
  for update;

  if not found then raise exception 'Quote not found for this company'; end if;
  if target_quote.status <> 'approved' then raise exception 'Quote must be approved before publishing'; end if;

  generated_token := encode(extensions.gen_random_bytes(32::integer), 'hex');
  update public.quotes
  set status = 'sent',
      public_token = null,
      public_token_hash = public.hash_public_quote_token(generated_token),
      public_token_expires_at = now() + make_interval(days => greatest(1, least(expiry_days, 90))),
      public_token_revoked_at = null,
      sent_at = now(),
      updated_at = now()
  where id = target_quote_id and company_id = target_company_id and status = 'approved';

  return generated_token;
end;
$$;

create or replace function public.rotate_public_quote_token(
  target_quote_id uuid,
  target_company_id uuid,
  expiry_days integer default 30
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_token text;
  target_quote public.quotes%rowtype;
begin
  if auth.uid() is null
    or not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed';
  end if;

  select * into target_quote
  from public.quotes
  where id = target_quote_id and company_id = target_company_id
  for update;

  if not found or target_quote.status <> 'sent' then raise exception 'Only sent quotes can rotate a public token'; end if;

  generated_token := encode(extensions.gen_random_bytes(32::integer), 'hex');
  update public.quotes
  set public_token = null,
      public_token_hash = public.hash_public_quote_token(generated_token),
      public_token_expires_at = now() + make_interval(days => greatest(1, least(expiry_days, 90))),
      public_token_revoked_at = null,
      updated_at = now()
  where id = target_quote_id and company_id = target_company_id and status = 'sent';

  return generated_token;
end;
$$;

create or replace function public.revoke_public_quote_token(
  target_quote_id uuid,
  target_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed';
  end if;

  update public.quotes
  set public_token = null,
      public_token_hash = null,
      public_token_expires_at = null,
      public_token_revoked_at = now(),
      updated_at = now()
  where id = target_quote_id
    and company_id = target_company_id
    and status in ('sent', 'accepted', 'rejected')
    and public_token_hash is not null;

  return found;
end;
$$;

create or replace function public.get_public_quote(raw_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'quoteNumber', q.quote_number,
    'title', q.title,
    'status', q.status,
    'validUntil', q.valid_until,
    'subtotalCents', q.subtotal_cents,
    'taxCents', q.tax_cents,
    'totalCents', q.total_cents,
    'currency', q.currency,
    'companyName', c.name,
    'customerName', cu.name,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'description', qi.description,
      'quantity', qi.quantity,
      'unit', qi.unit,
      'unitPriceCents', qi.unit_price_cents,
      'vatRate', qi.vat_rate,
      'lineTotalCents', qi.line_total_cents
    ) order by qi.position) from public.quote_items qi where qi.quote_id = q.id), '[]'::jsonb)
  )
  from public.quotes q
  join public.companies c on c.id = q.company_id
  join public.customers cu on cu.id = q.customer_id
  where q.public_token_hash = public.hash_public_quote_token(raw_token)
    and q.public_token_revoked_at is null
    and q.status in ('sent', 'accepted', 'rejected')
    and q.public_token_expires_at > now();
$$;

create or replace function public.customer_decide_quote(
  raw_token text,
  decision public.quote_status,
  comment text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  decided_quote record;
begin
  if decision not in ('accepted', 'rejected') then raise exception 'Invalid decision'; end if;

  update public.quotes
  set status = decision,
      customer_decision_at = now(),
      customer_comment = left(comment, 2000),
      accepted_at = case when decision = 'accepted' then now() else accepted_at end,
      updated_at = now()
  where public_token_hash = public.hash_public_quote_token(raw_token)
    and public_token_revoked_at is null
    and status = 'sent'
    and public_token_expires_at > now()
  returning id, company_id into decided_quote;

  if not found then return false; end if;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, metadata)
  values (
    decided_quote.company_id,
    case when decision = 'accepted' then 'quote.accepted' else 'quote.rejected' end,
    'quote',
    decided_quote.id,
    jsonb_build_object('source', 'public_quote')
  );

  return true;
end;
$$;

create or replace function public.customer_question_quote(raw_token text, question text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_quote public.quotes%rowtype;
  conversation_id uuid;
  questions_last_hour integer;
  questions_total integer;
begin
  if char_length(trim(question)) < 2 then raise exception 'Question is too short'; end if;

  select * into target_quote
  from public.quotes
  where public_token_hash = public.hash_public_quote_token(raw_token)
    and public_token_revoked_at is null
    and status = 'sent'
    and public_token_expires_at > now()
  for update;

  if not found then return false; end if;

  select count(*) into questions_last_hour
  from public.conversation_messages
  where company_id = target_quote.company_id
    and direction = 'inbound'
    and metadata ->> 'quote_id' = target_quote.id::text
    and metadata ->> 'source' = 'public_quote_link'
    and created_at > now() - interval '1 hour';

  select count(*) into questions_total
  from public.conversation_messages
  where company_id = target_quote.company_id
    and direction = 'inbound'
    and metadata ->> 'quote_id' = target_quote.id::text
    and metadata ->> 'source' = 'public_quote_link';

  if questions_last_hour >= 3 or questions_total >= 20 then return false; end if;

  insert into public.conversations (company_id, customer_id, channel, subject, status, last_message_at)
  values (target_quote.company_id, target_quote.customer_id, 'web', 'Vraag over offerte ' || target_quote.quote_number, 'open', now())
  returning id into conversation_id;

  insert into public.conversation_messages (conversation_id, company_id, direction, body, metadata)
  values (
    conversation_id,
    target_quote.company_id,
    'inbound',
    left(trim(question), 2000),
    jsonb_build_object('quote_id', target_quote.id::text, 'source', 'public_quote_link')
  );

  return true;
end;
$$;

create or replace function public.reserve_quote_email_delivery(
  target_company_id uuid,
  target_quote_id uuid,
  target_delivery_type text,
  target_recipient_email text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_quote public.quotes%rowtype;
  created_delivery_id uuid;
  existing_delivery record;
begin
  if auth.uid() is null
    or not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'Not allowed';
  end if;

  if target_delivery_type not in ('initial', 'reminder')
    or char_length(trim(target_recipient_email)) = 0 then
    raise exception 'Invalid delivery request';
  end if;

  select * into target_quote
  from public.quotes
  where id = target_quote_id and company_id = target_company_id
  for update;

  if not found then raise exception 'Quote not found for this company'; end if;
  if (target_delivery_type = 'initial' and target_quote.status not in ('approved', 'sent'))
    or (target_delivery_type = 'reminder' and target_quote.status <> 'sent') then
    raise exception 'Quote cannot be delivered in its current status';
  end if;

  insert into public.quote_email_deliveries (
    company_id, quote_id, delivery_type, recipient_email, status, idempotency_key, provider
  ) values (
    target_company_id, target_quote_id, target_delivery_type, trim(target_recipient_email), 'pending', target_idempotency_key, 'resend'
  )
  on conflict (quote_id, delivery_type, idempotency_key) do nothing
  returning id into created_delivery_id;

  if created_delivery_id is not null then
    return jsonb_build_object('deliveryId', created_delivery_id, 'shouldSend', true, 'status', 'pending');
  end if;

  select id, status into existing_delivery
  from public.quote_email_deliveries
  where quote_id = target_quote_id
    and delivery_type = target_delivery_type
    and idempotency_key = target_idempotency_key;

  return jsonb_build_object('deliveryId', existing_delivery.id, 'shouldSend', false, 'status', existing_delivery.status);
end;
$$;

create or replace function public.complete_quote_email_delivery(
  target_delivery_id uuid,
  target_company_id uuid,
  provider_message text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Only the mail service may complete a delivery'; end if;

  update public.quote_email_deliveries
  set status = 'sent', provider_message_id = left(provider_message, 255), error_code = null, sent_at = now()
  where id = target_delivery_id and company_id = target_company_id and status = 'pending';

  return found;
end;
$$;

create or replace function public.fail_quote_email_delivery(
  target_delivery_id uuid,
  target_company_id uuid,
  safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Only the mail service may fail a delivery'; end if;

  update public.quote_email_deliveries
  set status = 'failed', error_code = left(coalesce(nullif(trim(safe_error_code), ''), 'PROVIDER_ERROR'), 100)
  where id = target_delivery_id and company_id = target_company_id and status = 'pending';

  return found;
end;
$$;

-- Disable legacy raw-token entry points. The deprecated raw column is retained only for a later drop migration.
revoke all on function public.publish_quote_for_customer(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_public_quote(uuid) from public, anon, authenticated;
revoke all on function public.customer_decide_quote(uuid, public.quote_status, text) from public, anon, authenticated;
revoke all on function public.customer_question_quote(uuid, text) from public, anon, authenticated;

revoke all on function public.publish_quote_for_customer(uuid, uuid, integer) from public;
revoke all on function public.rotate_public_quote_token(uuid, uuid, integer) from public;
revoke all on function public.revoke_public_quote_token(uuid, uuid) from public;
revoke all on function public.hash_public_quote_token(text) from public;
revoke all on function public.get_public_quote(text) from public;
revoke all on function public.customer_decide_quote(text, public.quote_status, text) from public;
revoke all on function public.customer_question_quote(text, text) from public;
revoke all on function public.reserve_quote_email_delivery(uuid, uuid, text, text, uuid) from public;
revoke all on function public.complete_quote_email_delivery(uuid, uuid, text) from public;
revoke all on function public.fail_quote_email_delivery(uuid, uuid, text) from public;

grant execute on function public.publish_quote_for_customer(uuid, uuid, integer) to authenticated;
grant execute on function public.rotate_public_quote_token(uuid, uuid, integer) to authenticated;
grant execute on function public.revoke_public_quote_token(uuid, uuid) to authenticated;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.customer_decide_quote(text, public.quote_status, text) to anon, authenticated;
grant execute on function public.customer_question_quote(text, text) to anon, authenticated;
grant execute on function public.reserve_quote_email_delivery(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.complete_quote_email_delivery(uuid, uuid, text) to service_role;
grant execute on function public.fail_quote_email_delivery(uuid, uuid, text) to service_role;
