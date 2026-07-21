-- RSTECH-TASK-004: public links expose only customer-facing quote data.
create or replace function public.get_public_quote(token uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'quoteNumber', q.quote_number,
    'title', q.title,
    'notes', q.notes,
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
  where q.public_token = token
    and q.status in ('sent', 'accepted', 'rejected')
    and q.public_token_expires_at > now();
$$;

revoke all on function public.get_public_quote(uuid) from public;
grant execute on function public.get_public_quote(uuid) to anon, authenticated;
