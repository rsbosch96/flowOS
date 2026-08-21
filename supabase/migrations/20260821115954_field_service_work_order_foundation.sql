-- FS1.1: additive Field Service work-order foundation.
-- The module is intentionally planned/unreleased. No company entitlement is
-- bootstrapped here, and Core/Planning objects remain unchanged.

insert into public.module_catalog (module_key, display_name, description, release_state)
values (
  'field_service',
  'Field Service',
  'Werkbonnen voor uitvoering op locatie.',
  'planned'
)
on conflict (module_key) do nothing;

-- Field Service depends only on implicit Core. Core is intentionally not a
-- module_catalog row and therefore cannot be inserted into module_dependencies.

create table public.field_service_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  customer_id uuid not null,
  quote_id uuid references public.quotes(id) on update no action on delete restrict,
  planning_event_id uuid references public.planning_events(id) on update no action on delete set null,
  assigned_user_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  status text not null default 'planned' check (status in ('planned', 'dispatched', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.users(id) on update no action on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_service_work_orders_customer_company_fkey
    foreign key (customer_id, company_id)
    references public.customers(id, company_id)
    on update no action on delete restrict,
  constraint field_service_work_orders_assignee_membership_fkey
    foreign key (company_id, assigned_user_id)
    references public.company_memberships(company_id, user_id)
    on update no action on delete set null
);

create index field_service_work_orders_company_status_idx
  on public.field_service_work_orders(company_id, status, updated_at desc);
create index field_service_work_orders_customer_idx
  on public.field_service_work_orders(customer_id);
create index field_service_work_orders_quote_idx
  on public.field_service_work_orders(quote_id);
create index field_service_work_orders_planning_event_idx
  on public.field_service_work_orders(planning_event_id);
create index field_service_work_orders_assigned_user_idx
  on public.field_service_work_orders(assigned_user_id);

create or replace function public.enforce_field_service_work_order_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_quote_customer_id uuid;
  linked_quote_company_id uuid;
  linked_quote_status public.quote_status;
  linked_planning_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'FIELD_SERVICE_AUTH_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by <> auth.uid() then
      raise exception 'FIELD_SERVICE_ACTOR_MISMATCH';
    end if;
    if new.status <> 'planned'
      or new.started_at is not null
      or new.completed_at is not null
      or new.cancelled_at is not null then
      raise exception 'FIELD_SERVICE_INVALID_INITIAL_STATE';
    end if;
  else
    if new.company_id is distinct from old.company_id
      or new.customer_id is distinct from old.customer_id
      or new.created_by is distinct from old.created_by
      or new.quote_id is distinct from old.quote_id
      or new.planning_event_id is distinct from old.planning_event_id then
      raise exception 'FIELD_SERVICE_SOURCE_IMMUTABLE';
    end if;

    if new.assigned_user_id is distinct from old.assigned_user_id
      and not public.has_company_role(old.company_id, array['owner', 'employee']::public.company_role[]) then
      raise exception 'FIELD_SERVICE_ASSIGNMENT_FORBIDDEN';
    end if;

    if new.status = old.status then
      if new.started_at is distinct from old.started_at
        or new.completed_at is distinct from old.completed_at
        or new.cancelled_at is distinct from old.cancelled_at then
        raise exception 'FIELD_SERVICE_TIMESTAMP_IMMUTABLE';
      end if;
      new.started_at := old.started_at;
      new.completed_at := old.completed_at;
      new.cancelled_at := old.cancelled_at;
    elsif old.status = 'planned' and new.status not in ('dispatched', 'cancelled') then
      raise exception 'FIELD_SERVICE_INVALID_TRANSITION';
    elsif old.status = 'dispatched' and new.status not in ('in_progress', 'cancelled') then
      raise exception 'FIELD_SERVICE_INVALID_TRANSITION';
    elsif old.status = 'in_progress' and new.status not in ('completed', 'cancelled') then
      raise exception 'FIELD_SERVICE_INVALID_TRANSITION';
    elsif old.status in ('completed', 'cancelled') then
      raise exception 'FIELD_SERVICE_TERMINAL_STATE';
    end if;

    if new.status <> old.status then
      if new.started_at is distinct from old.started_at
        or new.completed_at is distinct from old.completed_at
        or new.cancelled_at is distinct from old.cancelled_at then
        raise exception 'FIELD_SERVICE_TIMESTAMP_CLIENT_WRITE';
      end if;
      if new.status = 'in_progress' then
        new.started_at := coalesce(old.started_at, now());
      else
        new.started_at := old.started_at;
      end if;
      if new.status = 'completed' then
        new.completed_at := coalesce(old.completed_at, now());
      else
        new.completed_at := old.completed_at;
      end if;
      if new.status = 'cancelled' then
        new.cancelled_at := coalesce(old.cancelled_at, now());
      else
        new.cancelled_at := old.cancelled_at;
      end if;
    end if;
  end if;

  if not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = auth.uid()
  ) then
    raise exception 'FIELD_SERVICE_MEMBERSHIP_REQUIRED';
  end if;

  if new.created_by is not null and not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = new.created_by
  ) then
    raise exception 'FIELD_SERVICE_CREATED_BY_TENANT_MISMATCH';
  end if;

  if new.quote_id is not null then
    select quote.company_id, quote.customer_id, quote.status
      into linked_quote_company_id, linked_quote_customer_id, linked_quote_status
    from public.quotes quote
    where quote.id = new.quote_id;
    if not found or linked_quote_company_id <> new.company_id then
      raise exception 'FIELD_SERVICE_QUOTE_TENANT_MISMATCH';
    end if;
    if linked_quote_status <> 'accepted' then
      raise exception 'FIELD_SERVICE_QUOTE_NOT_ACCEPTED';
    end if;
    if linked_quote_customer_id <> new.customer_id then
      raise exception 'FIELD_SERVICE_CUSTOMER_SOURCE_MISMATCH';
    end if;
  end if;

  if new.planning_event_id is not null then
    select event.company_id into linked_planning_company_id
    from public.planning_events event
    where event.id = new.planning_event_id;
    if not found or linked_planning_company_id <> new.company_id then
      raise exception 'FIELD_SERVICE_PLANNING_TENANT_MISMATCH';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_field_service_work_order_integrity() from public, anon, authenticated, service_role;

create trigger field_service_work_orders_integrity
before insert or update on public.field_service_work_orders
for each row execute function public.enforce_field_service_work_order_integrity();

create or replace function public.audit_field_service_work_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'field_service.created';
  elsif new.assigned_user_id is distinct from old.assigned_user_id then
    audit_action := 'field_service.assigned';
  elsif old.status = 'planned' and new.status = 'dispatched' then
    audit_action := 'field_service.dispatched';
  elsif old.status = 'dispatched' and new.status = 'in_progress' then
    audit_action := 'field_service.started';
  elsif old.status = 'in_progress' and new.status = 'completed' then
    audit_action := 'field_service.completed';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    audit_action := 'field_service.cancelled';
  else
    return new;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    auth.uid(),
    audit_action,
    'field_service_work_order',
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'status', new.status,
      'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
      'assignee_id', new.assigned_user_id
    ))
  );
  if tg_op = 'INSERT' and new.assigned_user_id is not null then
    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (
      new.company_id,
      auth.uid(),
      'field_service.assigned',
      'field_service_work_order',
      new.id,
      jsonb_build_object('status', new.status, 'assignee_id', new.assigned_user_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_field_service_work_order_change() from public, anon, authenticated, service_role;

create trigger field_service_work_orders_audit
after insert or update on public.field_service_work_orders
for each row execute function public.audit_field_service_work_order_change();

create or replace function public.create_field_service_work_order(
  target_company_id uuid,
  target_customer_id uuid,
  target_title text,
  target_description text default null,
  target_quote_id uuid default null,
  target_planning_event_id uuid default null,
  target_assigned_user_id uuid default null
)
returns public.field_service_work_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_work_order public.field_service_work_orders;
begin
  if auth.uid() is null then
    raise exception 'FIELD_SERVICE_AUTH_REQUIRED';
  end if;
  if not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'FIELD_SERVICE_ROLE_FORBIDDEN';
  end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  if target_title is null or char_length(btrim(target_title)) not between 2 and 160 then
    raise exception 'FIELD_SERVICE_TITLE_INVALID';
  end if;
  if target_description is not null and char_length(target_description) > 4000 then
    raise exception 'FIELD_SERVICE_DESCRIPTION_INVALID';
  end if;

  insert into public.field_service_work_orders (
    company_id, customer_id, quote_id, planning_event_id, assigned_user_id,
    title, description, created_by
  ) values (
    target_company_id, target_customer_id, target_quote_id, target_planning_event_id,
    target_assigned_user_id, btrim(target_title), target_description, auth.uid()
  ) returning * into created_work_order;

  return created_work_order;
end;
$$;

create or replace function public.transition_field_service_work_order(
  target_company_id uuid,
  target_work_order_id uuid,
  target_status text
)
returns public.field_service_work_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_work_order public.field_service_work_orders;
  updated_work_order public.field_service_work_orders;
  actor_role public.company_role;
begin
  if auth.uid() is null then
    raise exception 'FIELD_SERVICE_AUTH_REQUIRED';
  end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  select membership.role into actor_role
  from public.company_memberships membership
  where membership.company_id = target_company_id and membership.user_id = auth.uid();
  if not found then
    raise exception 'FIELD_SERVICE_MEMBERSHIP_REQUIRED';
  end if;

  select * into current_work_order
  from public.field_service_work_orders work_order
  where work_order.id = target_work_order_id
    and work_order.company_id = target_company_id
  for update;
  if not found then
    raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND';
  end if;
  if actor_role = 'technician' and current_work_order.assigned_user_id <> auth.uid() then
    raise exception 'FIELD_SERVICE_ASSIGNMENT_FORBIDDEN';
  end if;
  if actor_role not in ('owner', 'employee', 'technician') then
    raise exception 'FIELD_SERVICE_ROLE_FORBIDDEN';
  end if;
  if target_status not in ('planned', 'dispatched', 'in_progress', 'completed', 'cancelled') then
    raise exception 'FIELD_SERVICE_INVALID_STATUS';
  end if;
  if current_work_order.status = target_status then
    return current_work_order;
  end if;

  update public.field_service_work_orders
  set status = target_status
  where id = current_work_order.id and company_id = target_company_id
  returning * into updated_work_order;
  return updated_work_order;
end;
$$;

revoke all on function public.create_field_service_work_order(uuid, uuid, text, text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.transition_field_service_work_order(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_field_service_work_order(uuid, uuid, text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.transition_field_service_work_order(uuid, uuid, text) to authenticated;

alter table public.field_service_work_orders enable row level security;
revoke all on table public.field_service_work_orders from public, anon, authenticated, service_role;
grant select on table public.field_service_work_orders to authenticated;

create policy "field service authorized members read work orders"
on public.field_service_work_orders for select to authenticated
using (
  (select public.resolve_company_module_access(company_id, 'field_service') = 'MODULE_AVAILABLE')
  and (
    (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
    or ((select public.has_company_role(company_id, array['technician']::public.company_role[])) and assigned_user_id = auth.uid())
  )
);
