-- PL1: Planning is an additive module. It references Core records but never
-- changes Core tables, financial values, quote states, or invoice snapshots.

create table public.planning_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  customer_id uuid references public.customers(id) on update no action on delete set null,
  conversation_id uuid references public.conversations(id) on update no action on delete restrict,
  quote_id uuid references public.quotes(id) on update no action on delete restrict,
  invoice_id uuid references public.invoices(id) on update no action on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  event_type text not null check (event_type in ('appointment', 'work', 'delivery', 'internal')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  location text check (location is null or char_length(location) <= 240),
  assigned_user_id uuid,
  source_type text not null default 'manual' check (source_type in ('manual', 'quote', 'conversation', 'invoice')),
  created_by uuid not null references public.users(id) on update no action on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_events_end_after_start check (ends_at is null or ends_at > starts_at),
  constraint planning_events_source_shape check (
    (source_type = 'manual' and quote_id is null and conversation_id is null and invoice_id is null)
    or (source_type = 'quote' and quote_id is not null)
    or (source_type = 'conversation' and conversation_id is not null)
    or (source_type = 'invoice' and invoice_id is not null)
  ),
  constraint planning_events_status_shape check (
    (status = 'scheduled' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  ),
  constraint planning_events_assignee_membership_fkey
    foreign key (company_id, assigned_user_id)
    references public.company_memberships(company_id, user_id)
    on update no action
    on delete set null (assigned_user_id)
);

-- Every relation is indexed explicitly; Postgres does not create FK indexes.
create index planning_events_company_status_starts_idx on public.planning_events(company_id, status, starts_at);
create index planning_events_customer_idx on public.planning_events(customer_id);
create index planning_events_conversation_idx on public.planning_events(conversation_id);
create index planning_events_quote_idx on public.planning_events(quote_id);
create index planning_events_invoice_idx on public.planning_events(invoice_id);
create index planning_events_assigned_user_idx on public.planning_events(assigned_user_id);

-- Core quote/invoice tables deliberately do not gain new composite keys for
-- Planning. This trigger provides the same database-level tenant invariant
-- without changing any production-proven Core object.
create or replace function public.enforce_planning_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_customer_id uuid;
  linked_quote_status public.quote_status;
begin
  if auth.uid() is null then
    raise exception 'PLANNING_EVENT_AUTH_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by <> auth.uid() then
      raise exception 'PLANNING_EVENT_ACTOR_MISMATCH';
    end if;
    if new.status <> 'scheduled' or new.cancelled_at is not null then
      raise exception 'PLANNING_EVENT_INVALID_INITIAL_STATUS';
    end if;
  else
    if new.company_id is distinct from old.company_id
      or new.created_by is distinct from old.created_by
      or new.customer_id is distinct from old.customer_id
      or new.conversation_id is distinct from old.conversation_id
      or new.quote_id is distinct from old.quote_id
      or new.invoice_id is distinct from old.invoice_id
      or new.source_type is distinct from old.source_type then
      raise exception 'PLANNING_EVENT_SOURCE_IMMUTABLE';
    end if;

    if old.status = 'cancelled' then
      raise exception 'PLANNING_EVENT_CANCELLED_IMMUTABLE';
    end if;

    if new.status not in ('scheduled', 'cancelled') then
      raise exception 'PLANNING_EVENT_INVALID_STATUS';
    end if;
  end if;

  if new.customer_id is not null and not exists (
    select 1 from public.customers customer
    where customer.id = new.customer_id and customer.company_id = new.company_id
  ) then
    raise exception 'PLANNING_EVENT_CUSTOMER_TENANT_MISMATCH';
  end if;

  if new.conversation_id is not null then
    select conversation.customer_id into linked_customer_id
    from public.conversations conversation
    where conversation.id = new.conversation_id and conversation.company_id = new.company_id;
    if not found then
      raise exception 'PLANNING_EVENT_CONVERSATION_TENANT_MISMATCH';
    end if;
    if linked_customer_id is not null and new.customer_id is distinct from linked_customer_id then
      raise exception 'PLANNING_EVENT_CUSTOMER_SOURCE_MISMATCH';
    end if;
  end if;

  if new.quote_id is not null then
    select quote.customer_id, quote.status into linked_customer_id, linked_quote_status
    from public.quotes quote
    where quote.id = new.quote_id and quote.company_id = new.company_id;
    if not found then
      raise exception 'PLANNING_EVENT_QUOTE_TENANT_MISMATCH';
    end if;
    if linked_quote_status <> 'accepted' then
      raise exception 'PLANNING_EVENT_QUOTE_NOT_ACCEPTED';
    end if;
    if new.customer_id is distinct from linked_customer_id then
      raise exception 'PLANNING_EVENT_CUSTOMER_SOURCE_MISMATCH';
    end if;
  end if;

  if new.invoice_id is not null then
    select invoice.customer_id into linked_customer_id
    from public.invoices invoice
    where invoice.id = new.invoice_id and invoice.company_id = new.company_id;
    if not found then
      raise exception 'PLANNING_EVENT_INVOICE_TENANT_MISMATCH';
    end if;
    if new.customer_id is distinct from linked_customer_id then
      raise exception 'PLANNING_EVENT_CUSTOMER_SOURCE_MISMATCH';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = 'cancelled' and old.status = 'scheduled' then
    new.cancelled_at := now();
  elsif new.status = 'scheduled' then
    new.cancelled_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_planning_event_integrity() from public, anon, authenticated, service_role;

create trigger planning_events_integrity
before insert or update on public.planning_events
for each row execute function public.enforce_planning_event_integrity();

-- Keep operational mutations traceable, without storing titles, descriptions,
-- locations, customer data, or provider data in the audit metadata.
create or replace function public.audit_planning_event_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'planning.created'
      when old.status = 'scheduled' and new.status = 'cancelled' then 'planning.cancelled'
      else 'planning.updated'
    end,
    'planning_event',
    new.id,
    jsonb_build_object('event_type', new.event_type, 'status', new.status, 'source_type', new.source_type)
  );
  return new;
end;
$$;

revoke all on function public.audit_planning_event_change() from public, anon, authenticated, service_role;

create trigger planning_events_audit
after insert or update on public.planning_events
for each row execute function public.audit_planning_event_change();

alter table public.planning_events enable row level security;

create policy "planning members read events"
on public.planning_events for select to authenticated
using ((select public.is_company_member(company_id)));

create policy "planning managers create events"
on public.planning_events for insert to authenticated
with check ((select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])));

create policy "planning managers update events"
on public.planning_events for update to authenticated
using ((select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])))
with check ((select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])));

-- Cancellation is an UPDATE. There is deliberately no DELETE permission or
-- delete policy, so operational history cannot silently disappear.
revoke all on table public.planning_events from anon, authenticated, service_role;
grant select, insert, update on table public.planning_events to authenticated;
