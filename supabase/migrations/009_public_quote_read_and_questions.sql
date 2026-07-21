-- Safe, token-only access for a customer viewing a published quote.
create or replace function public.get_public_quote(token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'id', q.id, 'quoteNumber', q.quote_number, 'title', q.title, 'notes', q.notes,
    'status', q.status, 'validUntil', q.valid_until, 'subtotalCents', q.subtotal_cents,
    'taxCents', q.tax_cents, 'totalCents', q.total_cents, 'currency', q.currency,
    'companyName', c.name, 'customerName', cu.name, 'customerComment', q.customer_comment,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'description', qi.description, 'quantity', qi.quantity, 'unit', qi.unit,
      'unitPriceCents', qi.unit_price_cents, 'vatRate', qi.vat_rate, 'lineTotalCents', qi.line_total_cents
    ) order by qi.position) from public.quote_items qi where qi.quote_id = q.id), '[]'::jsonb)
  ) from public.quotes q join public.companies c on c.id = q.company_id
  join public.customers cu on cu.id = q.customer_id
  where q.public_token = token and q.status in ('sent', 'accepted', 'rejected')
    and (q.public_token_expires_at is null or q.public_token_expires_at > now());
$$;

create or replace function public.customer_question_quote(token uuid, question text)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_quote public.quotes%rowtype; conversation_id uuid;
begin
  if char_length(trim(question)) < 2 then raise exception 'Question is too short'; end if;
  select * into target_quote from public.quotes where public_token = token and status = 'sent'
    and (public_token_expires_at is null or public_token_expires_at > now());
  if not found then return false; end if;
  insert into public.conversations (company_id, customer_id, channel, subject, status, last_message_at)
    values (target_quote.company_id, target_quote.customer_id, 'web', 'Vraag over offerte ' || target_quote.quote_number, 'open', now()) returning id into conversation_id;
  insert into public.conversation_messages (conversation_id, company_id, direction, body, metadata)
    values (conversation_id, target_quote.company_id, 'inbound', left(trim(question), 2000), jsonb_build_object('quote_id', target_quote.id, 'source', 'public_quote_link'));
  return true;
end;
$$;

revoke all on function public.get_public_quote(uuid) from public;
revoke all on function public.customer_question_quote(uuid, text) from public;
grant execute on function public.get_public_quote(uuid) to anon, authenticated;
grant execute on function public.customer_question_quote(uuid, text) to anon, authenticated;
