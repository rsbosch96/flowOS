-- PL1 local runtime proof. Run only against a fresh local Supabase database:
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/planning-tenant-isolation.sql
-- The transaction is always rolled back; no test fixture remains afterwards.

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-pl1-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-pl1-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.users (id, email, full_name)
values
  ('11111111-1111-4111-8111-111111111111', 'zzz-pl1-a@example.test', 'ZZZ PL1 User A'),
  ('22222222-2222-4222-8222-222222222222', 'zzz-pl1-b@example.test', 'ZZZ PL1 User B');

insert into public.companies (id, name, slug)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ZZZ-PL1 Tenant A', 'zzz-pl1-tenant-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ZZZ-PL1 Tenant B', 'zzz-pl1-tenant-b');

insert into public.company_memberships (company_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'owner');

insert into public.customers (id, company_id, name, created_by)
values
  ('aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ZZZ PL1 Customer A', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ZZZ PL1 Customer B', '22222222-2222-4222-8222-222222222222');

insert into public.quotes (id, company_id, customer_id, quote_number, title, status, created_by, subtotal_cents, tax_cents, total_cents)
values
  ('aaaaaaaa-aaa2-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa', 'ZZZ-PL1-A', 'ZZZ PL1 Quote A', 'accepted', '11111111-1111-4111-8111-111111111111', 0, 0, 0),
  ('bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb', 'ZZZ-PL1-B', 'ZZZ PL1 Quote B', 'accepted', '22222222-2222-4222-8222-222222222222', 0, 0, 0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.planning_events (company_id, customer_id, quote_id, title, event_type, starts_at, source_type, created_by)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaa2-4aaa-8aaa-aaaaaaaaaaaa', 'ZZZ PL1 Event A', 'work', now() + interval '1 day', 'quote', '11111111-1111-4111-8111-111111111111');

do $$
declare changed_rows integer;
begin
  if (select count(*) from public.planning_events where company_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then
    raise exception 'PL1_RUNTIME_A_CANNOT_READ_OWN_EVENT';
  end if;

  if (select count(*) from public.planning_events where company_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 0 then
    raise exception 'PL1_RUNTIME_A_CAN_READ_B_EVENT';
  end if;

  begin
    insert into public.planning_events (company_id, customer_id, quote_id, title, event_type, starts_at, source_type, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb', 'Forbidden B event', 'work', now() + interval '1 day', 'quote', '11111111-1111-4111-8111-111111111111');
    raise exception 'PL1_RUNTIME_A_CREATED_B_EVENT';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.planning_events (company_id, customer_id, quote_id, title, event_type, starts_at, source_type, created_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb', 'Cross tenant quote', 'work', now() + interval '1 day', 'quote', '11111111-1111-4111-8111-111111111111');
    raise exception 'PL1_RUNTIME_A_ACCEPTED_B_QUOTE';
  exception when others then
    if position('PLANNING_EVENT_QUOTE_TENANT_MISMATCH' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    insert into public.planning_events (company_id, customer_id, title, event_type, starts_at, source_type, created_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb', 'Cross tenant customer', 'appointment', now() + interval '1 day', 'manual', '11111111-1111-4111-8111-111111111111');
    raise exception 'PL1_RUNTIME_A_ACCEPTED_B_CUSTOMER';
  exception when others then
    if position('PLANNING_EVENT_CUSTOMER_TENANT_MISMATCH' in sqlerrm) = 0 then raise; end if;
  end;

  update public.planning_events set status = 'cancelled' where company_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then raise exception 'PL1_RUNTIME_A_CANCELLED_B_EVENT'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

insert into public.planning_events (company_id, customer_id, quote_id, title, event_type, starts_at, source_type, created_by)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb', 'ZZZ PL1 Event B', 'work', now() + interval '1 day', 'quote', '22222222-2222-4222-8222-222222222222');

do $$
begin
  if (select count(*) from public.planning_events where company_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') <> 1 then
    raise exception 'PL1_RUNTIME_B_CANNOT_READ_OWN_EVENT';
  end if;
  if (select count(*) from public.planning_events where company_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 0 then
    raise exception 'PL1_RUNTIME_B_CAN_READ_A_EVENT';
  end if;
end;
$$;

rollback;
