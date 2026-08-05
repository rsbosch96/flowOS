-- Repair WP6.1A pgcrypto calls after the extension was installed outside public.
-- This migration deliberately replaces only the affected token helper functions.
-- Apply after 023_quote_delivery_and_hashed_public_tokens.sql and 024_invoice_integrity_and_numbering.sql.

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
