-- RC1 OR2B: shared, database-backed rate limiting for P0 actions.
-- Apply only after the matching application release is deployed.

create table if not exists public.rate_limit_windows (
  policy_key text not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_limit_windows_policy_subject_window_key unique (policy_key, subject_hash, window_start)
);

create index if not exists rate_limit_windows_cleanup_idx on public.rate_limit_windows (window_start);

alter table public.rate_limit_windows enable row level security;

revoke all on table public.rate_limit_windows from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  requested_policy text,
  requested_subject_hash text
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  max_requests integer;
  window_seconds integer;
  bucket_start timestamptz;
  consumed_count integer;
begin
  if requested_subject_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate-limit subject' using errcode = '22023';
  end if;

  case requested_policy
    when 'public_quote_read' then max_requests := 60; window_seconds := 600;
    when 'public_quote_read_global' then max_requests := 600; window_seconds := 600;
    when 'public_quote_decision_accept' then max_requests := 5; window_seconds := 900;
    when 'public_quote_decision_reject' then max_requests := 5; window_seconds := 900;
    when 'public_quote_question' then max_requests := 10; window_seconds := 600;
    when 'public_quote_write_global' then max_requests := 120; window_seconds := 600;
    when 'ai_quote_generate' then max_requests := 3; window_seconds := 600;
    when 'quote_email' then max_requests := 3; window_seconds := 900;
    when 'quote_reminder' then max_requests := 3; window_seconds := 86400;
    when 'quote_publish_or_token' then max_requests := 5; window_seconds := 900;
    when 'document_upload_sign' then max_requests := 10; window_seconds := 600;
    when 'product_image_upload_sign' then max_requests := 20; window_seconds := 600;
    when 'invoice_create' then max_requests := 5; window_seconds := 900;
    when 'invoice_status' then max_requests := 10; window_seconds := 600;
    when 'billing_checkout' then max_requests := 5; window_seconds := 1800;
    when 'onboarding' then max_requests := 3; window_seconds := 86400;
    else raise exception 'Unknown rate-limit policy' using errcode = '22023';
  end case;

  bucket_start := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);

  insert into public.rate_limit_windows as windows (policy_key, subject_hash, window_start, request_count)
  values (requested_policy, requested_subject_hash, bucket_start, 1)
  on conflict (policy_key, subject_hash, window_start)
  do update set
    request_count = windows.request_count + 1,
    updated_at = now()
  where windows.request_count < max_requests
  returning windows.request_count into consumed_count;

  if consumed_count is null then
    select windows.request_count into consumed_count
    from public.rate_limit_windows as windows
    where windows.policy_key = requested_policy
      and windows.subject_hash = requested_subject_hash
      and windows.window_start = bucket_start;

    return query select
      false,
      greatest(max_requests - coalesce(consumed_count, max_requests), 0),
      greatest(1, ceil(extract(epoch from (bucket_start + window_seconds * interval '1 second') - now()))::integer);
    return;
  end if;

  return query select
    true,
    greatest(max_requests - consumed_count, 0),
    greatest(1, ceil(extract(epoch from (bucket_start + window_seconds * interval '1 second') - now()))::integer);
end;
$$;

revoke all on function public.consume_rate_limit(text, text) from public, anon, authenticated, service_role;
grant execute on function public.consume_rate_limit(text, text) to service_role;

create or replace function public.raise_rate_limit(retry_after_seconds integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise sqlstate 'PGRST' using
    message = json_build_object(
      'code', 'RATE_LIMITED',
      'message', 'Te veel verzoeken. Probeer het later opnieuw.',
      'details', greatest(1, retry_after_seconds)::text
    )::text,
    detail = json_build_object(
      'status', 429,
      'headers', json_build_object('Retry-After', greatest(1, retry_after_seconds)::text, 'Cache-Control', 'no-store')
    )::text;
end;
$$;

revoke all on function public.raise_rate_limit(integer) from public, anon, authenticated, service_role;

create or replace function public.get_public_quote(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  limiter record;
  token_subject_hash text;
  global_subject_hash text;
  quote_payload jsonb;
begin
  global_subject_hash := encode(extensions.digest('public_quote_read_global'::text, 'sha256'::text), 'hex');
  select * into limiter from public.consume_rate_limit('public_quote_read_global', global_subject_hash);
  if not limiter.allowed then perform public.raise_rate_limit(limiter.retry_after_seconds); end if;

  token_subject_hash := public.hash_public_quote_token(raw_token);
  select * into limiter from public.consume_rate_limit('public_quote_read', token_subject_hash);
  if not limiter.allowed then perform public.raise_rate_limit(limiter.retry_after_seconds); end if;

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
  ) into quote_payload
  from public.quotes q
  join public.companies c on c.id = q.company_id
  join public.customers cu on cu.id = q.customer_id
  where q.public_token_hash = token_subject_hash
    and q.public_token_revoked_at is null
    and q.status in ('sent', 'accepted', 'rejected')
    and q.public_token_expires_at > now();

  return quote_payload;
end;
$$;

create or replace function public.customer_decide_quote(
  raw_token text,
  decision public.quote_status,
  comment text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  decided_quote record;
  limiter record;
  token_subject_hash text;
  global_subject_hash text;
  limiter_policy text;
begin
  if decision not in ('accepted', 'rejected') then raise exception 'Invalid decision'; end if;

  global_subject_hash := encode(extensions.digest('public_quote_write_global'::text, 'sha256'::text), 'hex');
  select * into limiter from public.consume_rate_limit('public_quote_write_global', global_subject_hash);
  if not limiter.allowed then perform public.raise_rate_limit(limiter.retry_after_seconds); end if;

  token_subject_hash := public.hash_public_quote_token(raw_token);
  limiter_policy := case when decision = 'accepted' then 'public_quote_decision_accept' else 'public_quote_decision_reject' end;
  select * into limiter from public.consume_rate_limit(limiter_policy, token_subject_hash);
  if not limiter.allowed then perform public.raise_rate_limit(limiter.retry_after_seconds); end if;

  update public.quotes
  set status = decision,
      customer_decision_at = now(),
      customer_comment = left(comment, 2000),
      accepted_at = case when decision = 'accepted' then now() else accepted_at end,
      updated_at = now()
  where public_token_hash = token_subject_hash
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
set search_path = public, pg_temp
as $$
declare
  target_quote public.quotes%rowtype;
  conversation_id uuid;
  questions_last_hour integer;
  questions_total integer;
  limiter record;
  token_subject_hash text;
  global_subject_hash text;
begin
  if char_length(trim(question)) < 2 then raise exception 'Question is too short'; end if;

  global_subject_hash := encode(extensions.digest('public_quote_write_global'::text, 'sha256'::text), 'hex');
  select * into limiter from public.consume_rate_limit('public_quote_write_global', global_subject_hash);
  if not limiter.allowed then perform public.raise_rate_limit(limiter.retry_after_seconds); end if;

  token_subject_hash := public.hash_public_quote_token(raw_token);
  select * into limiter from public.consume_rate_limit('public_quote_question', token_subject_hash);
  if not limiter.allowed then perform public.raise_rate_limit(limiter.retry_after_seconds); end if;

  select * into target_quote
  from public.quotes
  where public_token_hash = token_subject_hash
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

revoke all on function public.get_public_quote(text) from public, anon, authenticated, service_role;
revoke all on function public.customer_decide_quote(text, public.quote_status, text) from public, anon, authenticated, service_role;
revoke all on function public.customer_question_quote(text, text) from public, anon, authenticated, service_role;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.customer_decide_quote(text, public.quote_status, text) to anon, authenticated;
grant execute on function public.customer_question_quote(text, text) to anon, authenticated;
