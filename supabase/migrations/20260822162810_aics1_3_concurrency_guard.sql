-- AICS1.3: serialize takeover and draft generation at the database boundary.
create or replace function public.create_ai_reply_draft(
  target_company_id uuid,
  target_conversation_id uuid,
  target_source_message_id uuid,
  target_ai_run_id uuid,
  target_body text,
  target_actor_id uuid,
  target_intent text,
  target_requires_review boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_draft_id uuid;
  current_ownership text;
begin
  if not exists (
    select 1 from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_actor_id
      and membership.role in ('owner', 'employee')
  ) then raise exception 'AICS_ACTOR_FORBIDDEN'; end if;

  if not exists (
    select 1 from public.module_catalog module
    join public.company_module_entitlements entitlement on entitlement.module_key = module.module_key
      and entitlement.company_id = target_company_id and entitlement.is_enabled
    where module.module_key = 'ai_customer_service' and module.release_state = 'released'
  ) then raise exception 'AICS_MODULE_UNAVAILABLE'; end if;

  if not exists (
    select 1 from public.conversations conversation
    where conversation.id = target_conversation_id and conversation.company_id = target_company_id
  ) then raise exception 'AICS_CONVERSATION_COMPANY_MISMATCH'; end if;

  if not exists (
    select 1 from public.conversation_messages message
    where message.id = target_source_message_id
      and message.conversation_id = target_conversation_id
      and message.company_id = target_company_id
  ) then raise exception 'AICS_MESSAGE_CONVERSATION_MISMATCH'; end if;

  -- The state row is the serialization point. If takeover committed first,
  -- generation aborts before a successful draft or success audit is written.
  insert into public.ai_conversation_state (company_id, conversation_id, ownership_state, escalation_state, latest_intent)
  values (
    target_company_id,
    target_conversation_id,
    case when target_requires_review then 'needs_review' else 'ai_assisted' end,
    case when target_requires_review then 'needs_review' else 'none' end,
    target_intent
  )
  on conflict (conversation_id) do nothing;

  select ownership_state into current_ownership
  from public.ai_conversation_state
  where conversation_id = target_conversation_id
    and company_id = target_company_id
  for update;

  if current_ownership = 'human_owned' then
    raise exception 'AICS_HUMAN_OWNED';
  end if;
  if current_ownership not in ('ai_assisted', 'needs_review') then
    raise exception 'AICS_INVALID_TRANSITION';
  end if;

  update public.ai_conversation_state
  set ownership_state = case when target_requires_review then 'needs_review' else 'ai_assisted' end,
      escalation_state = case when target_requires_review then 'needs_review' else 'none' end,
      latest_intent = target_intent
  where conversation_id = target_conversation_id and company_id = target_company_id;

  insert into public.ai_reply_drafts (company_id, conversation_id, source_message_id, ai_run_id, body, provenance, review_status, created_by)
  values (target_company_id, target_conversation_id, target_source_message_id, target_ai_run_id, target_body, 'ai_generated', 'draft', target_actor_id)
  returning id into created_draft_id;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_company_id, target_actor_id, 'ai_customer_service.draft_generated', 'ai_reply_draft', created_draft_id,
    jsonb_build_object('conversation_id', target_conversation_id, 'ai_run_id', target_ai_run_id, 'intent', target_intent, 'status', case when target_requires_review then 'needs_review' else 'draft' end));
  return created_draft_id;
end;
$$;

revoke all on function public.create_ai_reply_draft(uuid, uuid, uuid, uuid, text, uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.create_ai_reply_draft(uuid, uuid, uuid, uuid, text, uuid, text, boolean) to service_role;

create or replace function public.takeover_ai_conversation(
  target_company_id uuid,
  target_conversation_id uuid,
  target_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_ownership text;
begin
  if not exists (
    select 1 from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_actor_id
      and membership.role in ('owner', 'employee')
  ) then raise exception 'AICS_ACCESS_FORBIDDEN'; end if;

  if not exists (
    select 1 from public.module_catalog module
    join public.company_module_entitlements entitlement on entitlement.module_key = module.module_key
      and entitlement.company_id = target_company_id and entitlement.is_enabled
    where module.module_key = 'ai_customer_service' and module.release_state = 'released'
  ) then raise exception 'AICS_NOT_AVAILABLE'; end if;

  if not exists (
    select 1 from public.conversations conversation
    where conversation.id = target_conversation_id and conversation.company_id = target_company_id
  ) then raise exception 'AICS_CONVERSATION_NOT_FOUND'; end if;

  select ownership_state into current_ownership
  from public.ai_conversation_state
  where conversation_id = target_conversation_id and company_id = target_company_id
  for update;

  if current_ownership is null then
    insert into public.ai_conversation_state (company_id, conversation_id, ownership_state, escalation_state, latest_intent)
    values (target_company_id, target_conversation_id, 'human_owned', 'escalated', 'human_requested');
    return jsonb_build_object('transitioned', true, 'already_owned', false);
  end if;

  if current_ownership = 'human_owned' then
    return jsonb_build_object('transitioned', false, 'already_owned', true);
  end if;
  if current_ownership not in ('ai_assisted', 'needs_review') then
    raise exception 'AICS_INVALID_TRANSITION';
  end if;

  update public.ai_conversation_state
  set ownership_state = 'human_owned', escalation_state = 'escalated', latest_intent = 'human_requested'
  where conversation_id = target_conversation_id and company_id = target_company_id;
  return jsonb_build_object('transitioned', true, 'already_owned', false);
end;
$$;

revoke all on function public.takeover_ai_conversation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.takeover_ai_conversation(uuid, uuid, uuid) to service_role;
