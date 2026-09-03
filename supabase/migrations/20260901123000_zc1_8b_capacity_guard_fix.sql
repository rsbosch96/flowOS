-- Forward hardening: NULL custom settings must fail closed in the membership guard.
create or replace function public.guard_membership_company_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare company_id_value uuid := coalesce(new.company_id, old.company_id); limit_value integer; usage_value integer;
begin
  if tg_op = 'INSERT' and coalesce(current_setting('app.zc1_8b_membership_write', true), '') <> 'on' then
    perform 1 from public.companies where id = company_id_value for update;
    limit_value := public.company_seat_limit(company_id_value); usage_value := public.company_seat_usage(company_id_value);
    if limit_value <= usage_value then raise exception 'SEAT_LIMIT_REACHED'; end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.guard_membership_company_capacity() from public, anon, authenticated, service_role;
