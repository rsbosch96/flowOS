-- AICS1.5: review mutations share the conversation ownership lock with takeover.
-- A stale review must never commit after the conversation becomes human-owned.
create or replace function public.review_ai_reply_draft(
  target_company_id uuid,
  target_conversation_id uuid,
  target_actor_id uuid,
  target_review_status text,
  target_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_ownership text;
  draft_row record;
  edited boolean;
begin
  if target_review_status not in ('draft', 'approved', 'rejected') then
    raise exception 'AICS_INVALID_TRANSITION';
  end if;

  if not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_actor_id
      and membership.role in ('owner', 'employee')
  ) then
    raise exception 'AICS_ACCESS_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.module_catalog module
    join public.company_module_entitlements entitlement
      on entitlement.module_key = module.module_key
     and entitlement.company_id = target_company_id
     and entitlement.is_enabled
    where module.module_key = 'ai_customer_service'
      and module.release_state = 'released'
  ) then
    raise exception 'AICS_NOT_AVAILABLE';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where conversation.id = target_conversation_id
      and conversation.company_id = target_company_id
  ) then
    raise exception 'AICS_CONVERSATION_NOT_FOUND';
  end if;

  -- Ensure every review has the same row to lock as takeover, including
  -- legacy conversations that did not yet have an AICS state row.
  insert into public.ai_conversation_state (
    company_id, conversation_id, ownership_state, escalation_state, latest_intent
  ) values (
    target_company_id, target_conversation_id, 'needs_review', 'needs_review', 'unknown'
  ) on conflict (conversation_id) do nothing;

  select ownership_state
    into current_ownership
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

  select id, review_status, provenance
    into draft_row
  from public.ai_reply_drafts
  where company_id = target_company_id
    and conversation_id = target_conversation_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'AICS_DRAFT_NOT_FOUND';
  end if;

  if target_review_status = 'draft' then
    if draft_row.review_status <> 'draft' or target_body is null then
      raise exception 'AICS_DRAFT_ALREADY_REVIEWED';
    end if;

    update public.ai_reply_drafts
    set body = target_body,
        provenance = 'human_edited'
    where id = draft_row.id;

    insert into public.audit_logs (
      company_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      target_company_id, target_actor_id, 'ai_customer_service.draft_edited',
      'ai_reply_draft', draft_row.id,
      jsonb_build_object('status', 'draft', 'provenance', 'human_edited')
    );

    return jsonb_build_object(
      'draft_id', draft_row.id,
      'review_status', 'draft',
      'provenance', 'human_edited'
    );
  end if;

  if draft_row.review_status <> 'draft' then
    raise exception 'AICS_DRAFT_ALREADY_REVIEWED';
  end if;

  edited := target_body is not null and char_length(btrim(target_body)) > 0;
  update public.ai_reply_drafts
  set review_status = target_review_status,
      body = case when target_body is not null then target_body else body end,
      provenance = case when edited then 'human_edited' else draft_row.provenance end,
      reviewed_by = target_actor_id,
      reviewed_at = now()
  where id = draft_row.id;

  insert into public.audit_logs (
    company_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_company_id, target_actor_id,
    case when target_review_status = 'approved'
      then 'ai_customer_service.draft_approved'
      else 'ai_customer_service.draft_rejected'
    end,
    'ai_reply_draft', draft_row.id,
    jsonb_build_object(
      'status', target_review_status,
      'provenance', case when edited then 'human_edited' else draft_row.provenance end
    )
  );

  return jsonb_build_object(
    'draft_id', draft_row.id,
    'review_status', target_review_status,
    'provenance', case when edited then 'human_edited' else draft_row.provenance end
  );
end;
$$;

revoke all on function public.review_ai_reply_draft(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_ai_reply_draft(uuid, uuid, uuid, text, text)
  to service_role;
