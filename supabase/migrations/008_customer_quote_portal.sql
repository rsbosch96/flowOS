-- Public customer-review link; token is random, unguessable and never exposes tenant data by ID.
alter table public.quotes add column if not exists public_token uuid unique;
alter table public.quotes add column if not exists public_token_expires_at timestamptz;
alter table public.quotes add column if not exists customer_decision_at timestamptz;
alter table public.quotes add column if not exists customer_comment text;

create or replace function public.publish_quote_for_customer(target_quote_id uuid, expiry_days integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare token uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.quotes q where q.id = target_quote_id and public.has_company_role(q.company_id, array['owner','employee']::public.company_role[])) then raise exception 'Not allowed'; end if;
  token := gen_random_uuid();
  update public.quotes set status='sent', public_token=token, public_token_expires_at=now() + make_interval(days => greatest(1, least(expiry_days, 90))), sent_at=now() where id=target_quote_id and status='approved';
  if not found then raise exception 'Quote must be approved before publishing'; end if;
  return token;
end; $$;

create or replace function public.customer_decide_quote(token uuid, decision public.quote_status, comment text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if decision not in ('accepted','rejected') then raise exception 'Invalid decision'; end if;
  update public.quotes set status=decision, customer_decision_at=now(), customer_comment=left(comment, 2000), accepted_at=case when decision='accepted' then now() else accepted_at end where public_token=token and status='sent' and public_token_expires_at > now();
  return found;
end; $$;
revoke all on function public.publish_quote_for_customer(uuid, integer) from public;
revoke all on function public.customer_decide_quote(uuid, public.quote_status, text) from public;
grant execute on function public.publish_quote_for_customer(uuid, integer) to authenticated;
grant execute on function public.customer_decide_quote(uuid, public.quote_status, text) to anon, authenticated;
