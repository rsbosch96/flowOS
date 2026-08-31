-- ZC1.7: audit commercial mutations at the database boundary.
-- No mutation route is introduced by this migration.

create or replace function public.audit_commercial_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
  audit_actor_id uuid;
  configured_actor text;
  target_company_id uuid;
begin
  target_company_id := new.company_id;
  configured_actor := nullif(current_setting('app.commercial_actor_id', true), '');
  audit_actor_id := case
    when configured_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then configured_actor::uuid
    else auth.uid()
  end;

  if tg_op = 'INSERT' then
    audit_action := 'subscription.created';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    audit_action := 'subscription.status_changed';
  elsif tg_op = 'UPDATE' and old.cancel_requested_at is null and new.cancel_requested_at is not null then
    audit_action := 'subscription.cancel_requested';
  elsif tg_op = 'UPDATE' and old.cancelled_at is null and new.cancelled_at is not null then
    audit_action := 'subscription.cancelled';
  elsif tg_op = 'UPDATE' and old.suspended_at is null and new.suspended_at is not null then
    audit_action := 'subscription.suspended';
  else
    return new;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    audit_actor_id,
    audit_action,
    'subscription',
    new.id,
    jsonb_build_object(
      'old_status', case when tg_op = 'INSERT' then null else old.status::text end,
      'new_status', new.status::text,
      'plan_version_id', new.plan_version_id
    )
  );
  return new;
end;
$$;

create or replace function public.audit_commercial_subscription_item_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_action text;
  audit_actor_id uuid;
  configured_actor text;
  target_company_id uuid;
  target_subscription_id uuid := new.subscription_id;
begin
  select company_id into target_company_id
  from public.subscriptions
  where id = target_subscription_id;

  configured_actor := nullif(current_setting('app.commercial_actor_id', true), '');
  audit_actor_id := case
    when configured_actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then configured_actor::uuid
    else auth.uid()
  end;

  if tg_op = 'INSERT' then
    audit_action := 'subscription_item.created';
  elsif tg_op = 'UPDATE' and old.quantity is distinct from new.quantity then
    audit_action := 'subscription_item.quantity_changed';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'removed' then
    audit_action := 'subscription_item.removed';
  else
    return new;
  end if;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    audit_actor_id,
    audit_action,
    'subscription_item',
    new.id,
    jsonb_build_object(
      'subscription_id', target_subscription_id,
      'old_quantity', case when tg_op = 'INSERT' then null else old.quantity end,
      'new_quantity', new.quantity,
      'item_code', new.item_code
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_commercial_subscription_change() from public, anon, authenticated, service_role;
revoke all on function public.audit_commercial_subscription_item_change() from public, anon, authenticated, service_role;

drop trigger if exists subscriptions_commercial_audit on public.subscriptions;
create trigger subscriptions_commercial_audit
after insert or update on public.subscriptions
for each row execute function public.audit_commercial_subscription_change();

drop trigger if exists subscription_items_commercial_audit on public.subscription_items;
create trigger subscription_items_commercial_audit
after insert or update on public.subscription_items
for each row execute function public.audit_commercial_subscription_item_change();
