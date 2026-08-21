-- FS1.2: narrow, intent-oriented Field Service mutations.
-- Field Service remains planned/unreleased; every operation is module-gated.

-- The FS1.1 generic transition endpoint is retained for historical replay but
-- is no longer an authenticated application capability.
revoke all on function public.transition_field_service_work_order(uuid, uuid, text)
  from public, anon, authenticated, service_role;

-- A create operation is already narrow in FS1.1. Re-state the authorization
-- contract here so the forward migration is self-documenting and future
-- changes cannot accidentally broaden it.
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

  -- Exactly one audit record per successful intent. Creation metadata carries
  -- the initial assignee instead of emitting a second assignment event.
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
      'old_assignee_id', case when tg_op = 'UPDATE' then old.assigned_user_id else null end,
      'new_assignee_id', new.assigned_user_id,
      'actor_id', auth.uid()
    ))
  );
  return new;
end;
$$;

revoke all on function public.create_field_service_work_order(uuid, uuid, text, text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_field_service_work_order(uuid, uuid, text, text, uuid, uuid, uuid)
  to authenticated;
revoke all on function public.audit_field_service_work_order_change() from public, anon, authenticated, service_role;

create or replace function public.validate_field_service_work_order_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.customers
    where id = new.customer_id and company_id = new.company_id
  ) then
    raise exception 'FIELD_SERVICE_CUSTOMER_TENANT_MISMATCH';
  end if;
  if new.assigned_user_id is not null and not exists (
    select 1 from public.company_memberships
    where company_id = new.company_id and user_id = new.assigned_user_id
  ) then
    raise exception 'FIELD_SERVICE_ASSIGNEE_INVALID';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_field_service_work_order_links() from public, anon, authenticated, service_role;
drop trigger if exists field_service_work_orders_link_validation on public.field_service_work_orders;
create trigger field_service_work_orders_link_validation
before insert or update on public.field_service_work_orders
for each row execute function public.validate_field_service_work_order_links();

create or replace function public.assign_field_service_work_order(
  target_company_id uuid,
  target_work_order_id uuid,
  target_assigned_user_id uuid default null
)
returns public.field_service_work_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_work_order public.field_service_work_orders;
  updated_work_order public.field_service_work_orders;
begin
  if auth.uid() is null then raise exception 'FIELD_SERVICE_AUTH_REQUIRED'; end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  if not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'FIELD_SERVICE_ASSIGNMENT_FORBIDDEN';
  end if;

  select * into current_work_order
  from public.field_service_work_orders
  where id = target_work_order_id and company_id = target_company_id
  for update;
  if not found then raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND'; end if;
  if current_work_order.status in ('completed', 'cancelled') then
    raise exception 'FIELD_SERVICE_ASSIGNMENT_TERMINAL';
  end if;
  if target_assigned_user_id is not null and not exists (
    select 1 from public.company_memberships
    where company_id = target_company_id and user_id = target_assigned_user_id
  ) then
    raise exception 'FIELD_SERVICE_ASSIGNEE_INVALID';
  end if;
  if current_work_order.assigned_user_id is not distinct from target_assigned_user_id then
    return current_work_order;
  end if;

  update public.field_service_work_orders
  set assigned_user_id = target_assigned_user_id
  where id = current_work_order.id
    and company_id = target_company_id
    and status = current_work_order.status
  returning * into updated_work_order;
  if not found then raise exception 'FIELD_SERVICE_CONCURRENT_CONFLICT'; end if;
  return updated_work_order;
end;
$$;

create or replace function public.dispatch_field_service_work_order(
  target_company_id uuid,
  target_work_order_id uuid
)
returns public.field_service_work_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_work_order public.field_service_work_orders;
  updated_work_order public.field_service_work_orders;
begin
  if auth.uid() is null then raise exception 'FIELD_SERVICE_AUTH_REQUIRED'; end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  if not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'FIELD_SERVICE_ROLE_FORBIDDEN';
  end if;
  select * into current_work_order from public.field_service_work_orders
  where id = target_work_order_id and company_id = target_company_id for update;
  if not found then raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND'; end if;
  if current_work_order.status = 'dispatched' then return current_work_order; end if;
  if current_work_order.status <> 'planned' then raise exception 'FIELD_SERVICE_TRANSITION_INVALID'; end if;
  if current_work_order.assigned_user_id is null then raise exception 'FIELD_SERVICE_ASSIGNEE_REQUIRED'; end if;
  update public.field_service_work_orders set status = 'dispatched'
  where id = current_work_order.id and company_id = target_company_id and status = 'planned'
  returning * into updated_work_order;
  if not found then raise exception 'FIELD_SERVICE_CONCURRENT_CONFLICT'; end if;
  return updated_work_order;
end;
$$;

create or replace function public.start_field_service_work_order(
  target_company_id uuid,
  target_work_order_id uuid
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
  if auth.uid() is null then raise exception 'FIELD_SERVICE_AUTH_REQUIRED'; end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  select role into actor_role from public.company_memberships
  where company_id = target_company_id and user_id = auth.uid();
  if not found then raise exception 'FIELD_SERVICE_MEMBERSHIP_REQUIRED'; end if;
  select * into current_work_order from public.field_service_work_orders
  where id = target_work_order_id and company_id = target_company_id for update;
  if not found then raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND'; end if;
  if actor_role = 'technician' and current_work_order.assigned_user_id <> auth.uid() then
    raise exception 'FIELD_SERVICE_ASSIGNMENT_FORBIDDEN';
  end if;
  if actor_role not in ('owner', 'employee', 'technician') then raise exception 'FIELD_SERVICE_ROLE_FORBIDDEN'; end if;
  if current_work_order.status = 'in_progress' then return current_work_order; end if;
  if current_work_order.status <> 'dispatched' then raise exception 'FIELD_SERVICE_TRANSITION_INVALID'; end if;
  update public.field_service_work_orders set status = 'in_progress'
  where id = current_work_order.id and company_id = target_company_id and status = 'dispatched'
  returning * into updated_work_order;
  if not found then raise exception 'FIELD_SERVICE_CONCURRENT_CONFLICT'; end if;
  return updated_work_order;
end;
$$;

create or replace function public.complete_field_service_work_order(
  target_company_id uuid,
  target_work_order_id uuid
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
  if auth.uid() is null then raise exception 'FIELD_SERVICE_AUTH_REQUIRED'; end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  select role into actor_role from public.company_memberships
  where company_id = target_company_id and user_id = auth.uid();
  if not found then raise exception 'FIELD_SERVICE_MEMBERSHIP_REQUIRED'; end if;
  select * into current_work_order from public.field_service_work_orders
  where id = target_work_order_id and company_id = target_company_id for update;
  if not found then raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND'; end if;
  if actor_role = 'technician' and current_work_order.assigned_user_id <> auth.uid() then
    raise exception 'FIELD_SERVICE_ASSIGNMENT_FORBIDDEN';
  end if;
  if actor_role not in ('owner', 'employee', 'technician') then raise exception 'FIELD_SERVICE_ROLE_FORBIDDEN'; end if;
  if current_work_order.status = 'completed' then return current_work_order; end if;
  if current_work_order.status <> 'in_progress' then raise exception 'FIELD_SERVICE_TRANSITION_INVALID'; end if;
  update public.field_service_work_orders set status = 'completed'
  where id = current_work_order.id and company_id = target_company_id and status = 'in_progress'
  returning * into updated_work_order;
  if not found then raise exception 'FIELD_SERVICE_CONCURRENT_CONFLICT'; end if;
  return updated_work_order;
end;
$$;

create or replace function public.cancel_field_service_work_order(
  target_company_id uuid,
  target_work_order_id uuid
)
returns public.field_service_work_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_work_order public.field_service_work_orders;
  updated_work_order public.field_service_work_orders;
begin
  if auth.uid() is null then raise exception 'FIELD_SERVICE_AUTH_REQUIRED'; end if;
  if public.resolve_company_module_access(target_company_id, 'field_service') <> 'MODULE_AVAILABLE' then
    raise exception 'FIELD_SERVICE_MODULE_UNAVAILABLE';
  end if;
  if not public.has_company_role(target_company_id, array['owner', 'employee']::public.company_role[]) then
    raise exception 'FIELD_SERVICE_ROLE_FORBIDDEN';
  end if;
  select * into current_work_order from public.field_service_work_orders
  where id = target_work_order_id and company_id = target_company_id for update;
  if not found then raise exception 'FIELD_SERVICE_WORK_ORDER_NOT_FOUND'; end if;
  if current_work_order.status = 'cancelled' then return current_work_order; end if;
  if current_work_order.status not in ('planned', 'dispatched', 'in_progress') then
    raise exception 'FIELD_SERVICE_TRANSITION_INVALID';
  end if;
  update public.field_service_work_orders set status = 'cancelled'
  where id = current_work_order.id and company_id = target_company_id
    and status = current_work_order.status
  returning * into updated_work_order;
  if not found then raise exception 'FIELD_SERVICE_CONCURRENT_CONFLICT'; end if;
  return updated_work_order;
end;
$$;

revoke all on function public.assign_field_service_work_order(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.assign_field_service_work_order(uuid, uuid, uuid) to authenticated;
revoke all on function public.dispatch_field_service_work_order(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.dispatch_field_service_work_order(uuid, uuid) to authenticated;
revoke all on function public.start_field_service_work_order(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.start_field_service_work_order(uuid, uuid) to authenticated;
revoke all on function public.complete_field_service_work_order(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.complete_field_service_work_order(uuid, uuid) to authenticated;
revoke all on function public.cancel_field_service_work_order(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_field_service_work_order(uuid, uuid) to authenticated;

revoke all on function public.enforce_field_service_work_order_integrity() from public, anon, authenticated, service_role;
revoke all on function public.audit_field_service_work_order_change() from public, anon, authenticated, service_role;
