-- ZC1.9D: converge AICS service/RLS authorization on the effective resolver.
-- The resolver is the only runtime entitlement authority. Legacy entitlement
-- tables remain available only for historical compatibility/backfill.

create or replace function public.assert_aics_module_available(
  target_company_id uuid,
  target_actor_id uuid,
  unavailable_code text default 'AICS_NOT_AVAILABLE'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  access_code text;
begin
  if target_company_id is null or target_actor_id is null then
    raise exception 'AICS_ACCESS_FORBIDDEN';
  end if;

  -- AICS mutations run through the service role after the HTTP layer has
  -- authenticated the actor. Set only the transaction-local subject so the
  -- canonical resolver evaluates that same actor, never service-role access.
  perform set_config('request.jwt.claim.sub', target_actor_id::text, true);
  select result.code
    into access_code
  from public.resolve_effective_module_access(target_company_id, 'ai_customer_service') result;

  if access_code <> 'MODULE_AVAILABLE' then
    raise exception '%', unavailable_code;
  end if;
end;
$$;

revoke all on function public.assert_aics_module_available(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.assert_aics_module_available(uuid, uuid, text)
  to service_role;

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

  perform public.assert_aics_module_available(target_company_id, target_actor_id, 'AICS_MODULE_UNAVAILABLE');

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

  -- The state row is the serialization point shared with takeover/review.
  insert into public.ai_conversation_state (company_id, conversation_id, ownership_state, escalation_state, latest_intent)
  values (
    target_company_id, target_conversation_id,
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

  if current_ownership = 'human_owned' then raise exception 'AICS_HUMAN_OWNED'; end if;
  if current_ownership not in ('ai_assisted', 'needs_review') then raise exception 'AICS_INVALID_TRANSITION'; end if;

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

  perform public.assert_aics_module_available(target_company_id, target_actor_id, 'AICS_NOT_AVAILABLE');

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
    select 1 from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_actor_id
      and membership.role in ('owner', 'employee')
  ) then raise exception 'AICS_ACCESS_FORBIDDEN'; end if;

  perform public.assert_aics_module_available(target_company_id, target_actor_id, 'AICS_NOT_AVAILABLE');

  if not exists (
    select 1 from public.conversations conversation
    where conversation.id = target_conversation_id and conversation.company_id = target_company_id
  ) then raise exception 'AICS_CONVERSATION_NOT_FOUND'; end if;

  insert into public.ai_conversation_state (
    company_id, conversation_id, ownership_state, escalation_state, latest_intent
  ) values (
    target_company_id, target_conversation_id, 'needs_review', 'needs_review', 'unknown'
  ) on conflict (conversation_id) do nothing;

  select ownership_state into current_ownership
  from public.ai_conversation_state
  where conversation_id = target_conversation_id and company_id = target_company_id
  for update;

  if current_ownership = 'human_owned' then raise exception 'AICS_HUMAN_OWNED'; end if;
  if current_ownership not in ('ai_assisted', 'needs_review') then raise exception 'AICS_INVALID_TRANSITION'; end if;

  select id, review_status, provenance into draft_row
  from public.ai_reply_drafts
  where company_id = target_company_id and conversation_id = target_conversation_id
  order by created_at desc limit 1 for update;
  if not found then raise exception 'AICS_DRAFT_NOT_FOUND'; end if;

  if target_review_status = 'draft' then
    if draft_row.review_status <> 'draft' or target_body is null then raise exception 'AICS_DRAFT_ALREADY_REVIEWED'; end if;
    update public.ai_reply_drafts set body = target_body, provenance = 'human_edited' where id = draft_row.id;
    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (target_company_id, target_actor_id, 'ai_customer_service.draft_edited', 'ai_reply_draft', draft_row.id,
      jsonb_build_object('status', 'draft', 'provenance', 'human_edited'));
    return jsonb_build_object('draft_id', draft_row.id, 'review_status', 'draft', 'provenance', 'human_edited');
  end if;

  if draft_row.review_status <> 'draft' then raise exception 'AICS_DRAFT_ALREADY_REVIEWED'; end if;
  edited := target_body is not null and char_length(btrim(target_body)) > 0;
  update public.ai_reply_drafts
  set review_status = target_review_status,
      body = case when target_body is not null then target_body else body end,
      provenance = case when edited then 'human_edited' else draft_row.provenance end,
      reviewed_by = target_actor_id,
      reviewed_at = now()
  where id = draft_row.id;

  insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id, target_actor_id,
    case when target_review_status = 'approved' then 'ai_customer_service.draft_approved' else 'ai_customer_service.draft_rejected' end,
    'ai_reply_draft', draft_row.id,
    jsonb_build_object('status', target_review_status, 'provenance', case when edited then 'human_edited' else draft_row.provenance end)
  );
  return jsonb_build_object('draft_id', draft_row.id, 'review_status', target_review_status,
    'provenance', case when edited then 'human_edited' else draft_row.provenance end);
end;
$$;

revoke all on function public.review_ai_reply_draft(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_ai_reply_draft(uuid, uuid, uuid, text, text) to service_role;

-- Policies use the authoritative structured resolver directly. The scalar
-- subquery is required because the resolver returns a decision row.
drop policy if exists "aics owners read settings" on public.ai_customer_service_settings;
create policy "aics owners read settings"
on public.ai_customer_service_settings for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'ai_customer_service') result) = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner']::public.company_role[])
);

drop policy if exists "aics members read approved knowledge" on public.ai_knowledge_entries;
create policy "aics members read approved knowledge"
on public.ai_knowledge_entries for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'ai_customer_service') result) = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])
  and is_enabled and is_approved
);

drop policy if exists "aics members read state" on public.ai_conversation_state;
create policy "aics members read state"
on public.ai_conversation_state for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'ai_customer_service') result) = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.company_id = public.ai_conversation_state.company_id
  )
);

drop policy if exists "aics members read drafts" on public.ai_reply_drafts;
create policy "aics members read drafts"
on public.ai_reply_drafts for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'ai_customer_service') result) = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.company_id = public.ai_reply_drafts.company_id
  )
);

-- Planning had legacy membership-only policies. Replace them so a grant,
-- release state, dependency chain, and suspension are all enforced by the
-- same effective resolver used by the application and API.
drop policy if exists "planning members read events" on public.planning_events;
create policy "planning members read events"
on public.planning_events for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'planning') result) = 'MODULE_AVAILABLE'
  and (select public.is_company_member(company_id))
);

drop policy if exists "planning managers create events" on public.planning_events;
create policy "planning managers create events"
on public.planning_events for insert to authenticated
with check (
  (select result.code from public.resolve_effective_module_access(company_id, 'planning') result) = 'MODULE_AVAILABLE'
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
);

drop policy if exists "planning managers update events" on public.planning_events;
create policy "planning managers update events"
on public.planning_events for update to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'planning') result) = 'MODULE_AVAILABLE'
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
)
with check (
  (select result.code from public.resolve_effective_module_access(company_id, 'planning') result) = 'MODULE_AVAILABLE'
  and (select public.has_company_role(company_id, array['owner', 'employee']::public.company_role[]))
);

-- Field Service remains planned and therefore denied even if a test grant is
-- inserted. These policies are rewritten directly against the resolver too;
-- the compatibility wrapper remains available only for older server callers.
drop policy if exists "field service authorized members read work orders" on public.field_service_work_orders;
create policy "field service authorized members read work orders"
on public.field_service_work_orders for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'field_service') result) = 'MODULE_AVAILABLE'
  and (
    (select public.has_company_role(company_id, array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id, array['technician']::public.company_role[])) and assigned_user_id = auth.uid())
  )
);

drop policy if exists "field service authorized members read materials" on public.field_service_work_order_materials;
create policy "field service authorized members read materials"
on public.field_service_work_order_materials for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'field_service') result) = 'MODULE_AVAILABLE'
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);

drop policy if exists "field service authorized members read notes" on public.field_service_work_order_notes;
create policy "field service authorized members read notes"
on public.field_service_work_order_notes for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'field_service') result) = 'MODULE_AVAILABLE'
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);

drop policy if exists "field service authorized members read evidence" on public.field_service_work_order_evidence;
create policy "field service authorized members read evidence"
on public.field_service_work_order_evidence for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'field_service') result) = 'MODULE_AVAILABLE'
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);

drop policy if exists "field service authorized members read signoffs" on public.field_service_work_order_signoffs;
create policy "field service authorized members read signoffs"
on public.field_service_work_order_signoffs for select to authenticated
using (
  (select result.code from public.resolve_effective_module_access(company_id, 'field_service') result) = 'MODULE_AVAILABLE'
  and (
    (select public.has_company_role(company_id,array['owner','employee']::public.company_role[]))
    or ((select public.has_company_role(company_id,array['technician']::public.company_role[]))
      and exists(select 1 from public.field_service_work_orders wo where wo.id=work_order_id and wo.assigned_user_id=auth.uid()))
  )
);
