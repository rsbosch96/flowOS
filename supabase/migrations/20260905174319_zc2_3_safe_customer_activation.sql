-- ZC2.3: trusted, provider-neutral Early Access activation.
-- This is an operator control-plane RPC. It never creates provider objects,
-- never writes legacy entitlements and never releases planned modules.
begin;

create or replace function public.activate_early_access_company(target_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_version public.commercial_plan_versions%rowtype;
  existing_subscription public.subscriptions%rowtype;
  new_subscription public.subscriptions%rowtype;
  existing_commercial_grant public.entitlement_grants%rowtype;
  usage_value integer;
  activation_started timestamptz;
  intro_price_until_value timestamptz;
  period_end timestamptz;
  grant_id uuid;
begin
  -- EXECUTE is revoked from every role except service_role below. The
  -- application route adds a deployment-only operator key; no actor metadata
  -- is accepted from the caller.

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text, 0));

  perform 1
  from public.companies
  where id = target_company_id
  for update;
  if not found then
    raise exception 'COMMERCIAL_COMPANY_NOT_FOUND';
  end if;

  select version.* into plan_version
  from public.commercial_plan_versions version
  join public.commercial_plans plan on plan.id = version.plan_id
  where plan.code = 'early_access'
    and plan.status = 'active'
    and version.status = 'active'
    and version.billing_interval = 'monthly'
    and version.currency = 'EUR'
    and version.base_price_cents = 4900
    and version.included_seats = 3
    and version.extra_seat_price_cents = 900
    and version.valid_from <= statement_timestamp()
    and (version.valid_until is null or version.valid_until > statement_timestamp())
  order by version.version desc
  limit 1;
  if not found then
    raise exception 'COMMERCIAL_EARLY_ACCESS_PLAN_UNAVAILABLE';
  end if;

  select * into existing_subscription
  from public.subscriptions subscription
  where subscription.company_id = target_company_id
    and subscription.is_primary
    and subscription.status in ('trialing','active','past_due','grace_period','suspended')
  order by subscription.updated_at desc
  limit 1
  for update;

  if existing_subscription.id is not null then
    if existing_subscription.plan_version_id is distinct from plan_version.id
      or existing_subscription.billing_provider is distinct from 'manual'
      or existing_subscription.currency is distinct from 'EUR'
      or existing_subscription.billing_interval is distinct from 'monthly'
      or existing_subscription.base_price_cents is distinct from 4900
      or existing_subscription.included_seats is distinct from 3
      or existing_subscription.extra_seat_price_cents is distinct from 900
      or existing_subscription.intro_price_until is null
      or existing_subscription.is_primary is not true
    then
      raise exception 'COMMERCIAL_SUBSCRIPTION_CONFLICT';
    end if;

    select * into existing_commercial_grant
    from public.entitlement_grants grant_record
    where grant_record.company_id = target_company_id
      and grant_record.module_key = 'planning'
      and grant_record.source = 'commercial'
      and grant_record.reference_kind = 'subscription'
      and grant_record.reference_key = existing_subscription.id::text
      and grant_record.status = 'active'
    for update;
    if not found then
      raise exception 'COMMERCIAL_ACTIVATION_INCOMPLETE';
    end if;

    return jsonb_build_object(
      'status', 'already_active',
      'company_id', target_company_id,
      'subscription_id', existing_subscription.id,
      'grant_id', existing_commercial_grant.id,
      'plan_code', 'early_access',
      'plan_version_id', plan_version.id,
      'included_seats', existing_subscription.included_seats,
      'extra_seat_price_cents', existing_subscription.extra_seat_price_cents,
      'planning', 'commercial'
    );
  end if;

  select (
    (select count(*)::integer from public.company_memberships membership where membership.company_id = target_company_id)
    + (select count(*)::integer from public.company_invitations invitation where invitation.company_id = target_company_id and invitation.status = 'pending' and invitation.expires_at > statement_timestamp())
  ) into usage_value;
  if usage_value > plan_version.included_seats then
    raise exception 'COMMERCIAL_CAPACITY_EXCEEDED';
  end if;

  activation_started := statement_timestamp();
  intro_price_until_value := activation_started + interval '12 months';
  period_end := activation_started + interval '1 month';

  insert into public.audit_logs (company_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    'commercial.activation_started',
    'commercial_activation',
    target_company_id,
    jsonb_build_object(
      'plan_code', 'early_access',
      'plan_version_id', plan_version.id,
      'actor_kind', 'system',
      'actor_principal', 'early_access_operator'
    )
  );

  insert into public.subscriptions (
    company_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    seats,
    plan_version_id,
    billing_provider,
    currency,
    billing_interval,
    base_price_cents,
    included_seats,
    extra_seat_price_cents,
    intro_price_until,
    is_primary,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id
  ) values (
    target_company_id,
    'active',
    activation_started,
    period_end,
    false,
    plan_version.included_seats,
    plan_version.id,
    'manual',
    'EUR',
    'monthly',
    plan_version.base_price_cents,
    plan_version.included_seats,
    plan_version.extra_seat_price_cents,
    intro_price_until_value,
    true,
    null,
    null,
    null
  ) returning * into new_subscription;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    'commercial.subscription_created',
    'subscription',
    new_subscription.id,
    jsonb_build_object(
      'subscription_id', new_subscription.id,
      'plan_code', 'early_access',
      'plan_version_id', plan_version.id,
      'billing_provider', 'manual',
      'currency', 'EUR',
      'billing_interval', 'monthly',
      'base_price_cents', 4900,
      'included_seats', 3,
      'extra_seat_price_cents', 900,
      'intro_price_until', intro_price_until_value,
      'actor_kind', 'system',
      'actor_principal', 'early_access_operator'
    )
  );

  insert into public.entitlement_grants (
    company_id,
    module_key,
    source,
    status,
    valid_from,
    valid_until,
    reason,
    reference_kind,
    reference_key,
    actor_kind,
    actor_principal
  ) values (
    target_company_id,
    'planning',
    'commercial',
    'active',
    activation_started,
    null,
    'Included in FlowOS Early Access subscription',
    'subscription',
    new_subscription.id::text,
    'system',
    'early_access_operator'
  ) returning id into grant_id;

  insert into public.audit_logs (company_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    'commercial.entitlement_projected',
    'entitlement_grant',
    grant_id,
    jsonb_build_object(
      'subscription_id', new_subscription.id,
      'plan_version_id', plan_version.id,
      'module_key', 'planning',
      'source', 'commercial',
      'actor_kind', 'system',
      'actor_principal', 'early_access_operator'
    )
  );

  insert into public.audit_logs (company_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    'commercial.activation_completed',
    'subscription',
    new_subscription.id,
    jsonb_build_object(
      'subscription_id', new_subscription.id,
      'grant_id', grant_id,
      'plan_code', 'early_access',
      'plan_version_id', plan_version.id,
      'actor_kind', 'system',
      'actor_principal', 'early_access_operator'
    )
  );

  return jsonb_build_object(
    'status', 'activated',
    'company_id', target_company_id,
    'subscription_id', new_subscription.id,
    'grant_id', grant_id,
    'plan_code', 'early_access',
    'plan_version_id', plan_version.id,
    'base_price_cents', new_subscription.base_price_cents,
    'currency', new_subscription.currency,
    'billing_interval', new_subscription.billing_interval,
    'included_seats', new_subscription.included_seats,
    'extra_seat_price_cents', new_subscription.extra_seat_price_cents,
    'current_period_start', new_subscription.current_period_start,
    'intro_price_until', new_subscription.intro_price_until,
    'planning', 'commercial',
    'field_service', 'MODULE_NOT_RELEASED',
    'ai_customer_service', 'MODULE_NOT_RELEASED'
  );
end;
$$;

revoke all on function public.activate_early_access_company(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_early_access_company(uuid) to service_role;

-- Future cancellation/suspension workflows may revoke only the commercial
-- projection created by this operation. Independent manual, promotional and
-- migration grants remain untouched. No customer-facing route is exposed.
create or replace function public.revoke_early_access_commercial_grant(target_grant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  grant_record public.entitlement_grants%rowtype;
begin
  select * into grant_record
  from public.entitlement_grants
  where id = target_grant_id
  for update;
  if not found then
    raise exception 'COMMERCIAL_GRANT_NOT_FOUND';
  end if;
  if grant_record.source <> 'commercial' or grant_record.reference_kind <> 'subscription' then
    raise exception 'COMMERCIAL_GRANT_SCOPE_INVALID';
  end if;
  if grant_record.status = 'revoked' then
    return false;
  end if;
  update public.entitlement_grants
  set status = 'revoked', revoked_at = statement_timestamp(), revoked_by_principal = 'early_access_operator'
  where id = target_grant_id and status = 'active';
  return found;
end;
$$;

revoke all on function public.revoke_early_access_commercial_grant(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_early_access_commercial_grant(uuid) to service_role;

commit;
