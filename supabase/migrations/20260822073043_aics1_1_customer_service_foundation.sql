-- AICS1.1: AI Customer Service foundation.
-- Core conversations/messages remain canonical. This migration adds only
-- tenant-scoped supporting records and keeps the module planned by default.

insert into public.module_catalog (module_key, display_name, description, release_state)
values (
  'ai_customer_service',
  'AI-klantenservice',
  'Veilige AI-ondersteuning voor menselijke beoordeling van klantvragen.',
  'planned'
)
on conflict (module_key) do update
set display_name = excluded.display_name,
    description = excluded.description;

create table public.ai_customer_service_settings (
  company_id uuid primary key references public.companies(id) on update no action on delete cascade,
  assistance_enabled boolean not null default false,
  review_policy text not null default 'human_required'
    check (review_policy in ('human_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  source_type text not null check (source_type in ('manual', 'faq', 'catalog', 'document_reference')),
  source_reference uuid references public.documents(id) on update no action on delete set null,
  is_enabled boolean not null default true,
  is_approved boolean not null default false,
  approved_by uuid references public.users(id) on update no action on delete set null,
  approved_at timestamptz,
  created_by uuid not null references public.users(id) on update no action on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_approval_consistency check (
    (is_approved and approved_at is not null) or (not is_approved and approved_at is null)
  )
);

create table public.ai_conversation_state (
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  conversation_id uuid primary key references public.conversations(id) on update no action on delete cascade,
  ownership_state text not null default 'ai_assisted'
    check (ownership_state in ('ai_assisted', 'needs_review', 'human_owned', 'resolved')),
  escalation_state text not null default 'none'
    check (escalation_state in ('none', 'needs_review', 'escalated')),
  latest_intent text not null default 'unknown'
    check (latest_intent in ('general_question', 'product_service_question', 'quote_question', 'appointment_question', 'complaint', 'billing_question', 'technical_support', 'human_requested', 'privacy', 'legal', 'security', 'account_changes', 'unknown')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.ai_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on update no action on delete cascade,
  conversation_id uuid not null references public.conversations(id) on update no action on delete cascade,
  source_message_id uuid references public.conversation_messages(id) on update no action on delete set null,
  ai_run_id uuid references public.ai_runs(id) on update no action on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 12000),
  provenance text not null default 'ai_generated' check (provenance in ('ai_generated', 'human_edited')),
  review_status text not null default 'draft' check (review_status in ('draft', 'approved', 'rejected')),
  created_by uuid not null references public.users(id) on update no action on delete restrict,
  reviewed_by uuid references public.users(id) on update no action on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_knowledge_entries_company_enabled_idx
  on public.ai_knowledge_entries(company_id, is_enabled, is_approved, updated_at desc);
create index ai_reply_drafts_company_conversation_idx
  on public.ai_reply_drafts(company_id, conversation_id, created_at desc);
create index ai_conversation_state_company_idx
  on public.ai_conversation_state(company_id, updated_at desc);

create or replace function public.validate_aics_tenant_links()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'ai_conversation_state' then
    if not exists (
      select 1 from public.conversations c
      where c.id = new.conversation_id and c.company_id = new.company_id
    ) then raise exception 'AICS_CONVERSATION_COMPANY_MISMATCH'; end if;
  elsif tg_table_name = 'ai_reply_drafts' then
    if not exists (
      select 1 from public.conversations c
      where c.id = new.conversation_id and c.company_id = new.company_id
    ) then raise exception 'AICS_CONVERSATION_COMPANY_MISMATCH'; end if;
    if new.source_message_id is not null and not exists (
      select 1 from public.conversation_messages m
      where m.id = new.source_message_id
        and m.conversation_id = new.conversation_id
        and m.company_id = new.company_id
    ) then raise exception 'AICS_MESSAGE_CONVERSATION_MISMATCH'; end if;
    if not exists (
      select 1 from public.company_memberships membership
      where membership.company_id = new.company_id and membership.user_id = new.created_by
    ) then raise exception 'AICS_CREATOR_NOT_SAME_COMPANY'; end if;
    if new.reviewed_by is not null and not exists (
      select 1 from public.company_memberships membership
      where membership.company_id = new.company_id and membership.user_id = new.reviewed_by
    ) then raise exception 'AICS_REVIEWER_NOT_SAME_COMPANY'; end if;
  elsif tg_table_name = 'ai_knowledge_entries' then
    if new.source_reference is not null and not exists (
      select 1 from public.documents d
      where d.id = new.source_reference and d.company_id = new.company_id
    ) then raise exception 'AICS_DOCUMENT_COMPANY_MISMATCH'; end if;
    if not exists (
      select 1 from public.company_memberships membership
      where membership.company_id = new.company_id and membership.user_id = new.created_by
    ) then
      raise exception 'AICS_CREATOR_NOT_SAME_COMPANY';
    end if;
    if new.approved_by is not null and not exists (
      select 1 from public.company_memberships membership
      where membership.company_id = new.company_id and membership.user_id = new.approved_by
    ) then
      raise exception 'AICS_APPROVER_NOT_SAME_COMPANY';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_aics_tenant_links() from public, anon, authenticated, service_role;

create trigger ai_knowledge_entries_validate_links
before insert or update on public.ai_knowledge_entries
for each row execute function public.validate_aics_tenant_links();
create trigger ai_conversation_state_validate_links
before insert or update on public.ai_conversation_state
for each row execute function public.validate_aics_tenant_links();
create trigger ai_reply_drafts_validate_links
before insert or update on public.ai_reply_drafts
for each row execute function public.validate_aics_tenant_links();

create or replace function public.set_aics_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function public.set_aics_updated_at() from public, anon, authenticated, service_role;
create trigger ai_settings_set_updated_at before update on public.ai_customer_service_settings
for each row execute function public.set_aics_updated_at();
create trigger ai_knowledge_set_updated_at before update on public.ai_knowledge_entries
for each row execute function public.set_aics_updated_at();
create trigger ai_state_set_updated_at before update on public.ai_conversation_state
for each row execute function public.set_aics_updated_at();
create trigger ai_drafts_set_updated_at before update on public.ai_reply_drafts
for each row execute function public.set_aics_updated_at();

-- Atomic server-only operation: state and draft are committed together, so a
-- provider/storage failure cannot leave a half-created AICS draft behind.
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

  insert into public.ai_conversation_state (company_id, conversation_id, ownership_state, escalation_state, latest_intent)
  values (
    target_company_id,
    target_conversation_id,
    case when target_requires_review then 'needs_review' else 'ai_assisted' end,
    case when target_requires_review then 'needs_review' else 'none' end,
    target_intent
  )
  on conflict (conversation_id) do update set
    ownership_state = excluded.ownership_state,
    escalation_state = excluded.escalation_state,
    latest_intent = excluded.latest_intent;

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

alter table public.ai_customer_service_settings enable row level security;
alter table public.ai_knowledge_entries enable row level security;
alter table public.ai_conversation_state enable row level security;
alter table public.ai_reply_drafts enable row level security;

revoke all on table public.ai_customer_service_settings from public, anon, authenticated, service_role;
revoke all on table public.ai_knowledge_entries from public, anon, authenticated, service_role;
revoke all on table public.ai_conversation_state from public, anon, authenticated, service_role;
revoke all on table public.ai_reply_drafts from public, anon, authenticated, service_role;

-- Read-only Data API exposure is intentionally narrow. All mutations use the
-- reviewed server/admin path; the database policies still enforce tenant and
-- module access for reads.
grant select on table public.ai_customer_service_settings to authenticated;
grant select on table public.ai_knowledge_entries to authenticated;
grant select on table public.ai_conversation_state to authenticated;
grant select on table public.ai_reply_drafts to authenticated;
grant select, insert, update on table public.ai_customer_service_settings to service_role;
grant select, insert, update on table public.ai_knowledge_entries to service_role;
grant select, insert, update on table public.ai_conversation_state to service_role;
grant select, insert, update on table public.ai_reply_drafts to service_role;

create policy "aics owners read settings"
on public.ai_customer_service_settings for select to authenticated
using (
  public.resolve_company_module_access(company_id, 'ai_customer_service') = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner']::public.company_role[])
);

create policy "aics members read approved knowledge"
on public.ai_knowledge_entries for select to authenticated
using (
  public.resolve_company_module_access(company_id, 'ai_customer_service') = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])
  and is_enabled and is_approved
);

create policy "aics members read state"
on public.ai_conversation_state for select to authenticated
using (
  public.resolve_company_module_access(company_id, 'ai_customer_service') = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.company_id = public.ai_conversation_state.company_id
  )
);

create policy "aics members read drafts"
on public.ai_reply_drafts for select to authenticated
using (
  public.resolve_company_module_access(company_id, 'ai_customer_service') = 'MODULE_AVAILABLE'
  and public.has_company_role(company_id, array['owner', 'employee']::public.company_role[])
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.company_id = public.ai_reply_drafts.company_id
  )
);

comment on table public.ai_customer_service_settings is 'AICS1.1: one tenant setting row; runtime access is denied while module is planned.';
comment on table public.ai_knowledge_entries is 'AICS1.1: explicitly curated and approved knowledge only.';
comment on table public.ai_conversation_state is 'AICS1.1: state for the canonical Core conversation; never a duplicate conversation.';
comment on table public.ai_reply_drafts is 'AICS1.1: human-review drafts only; never a sent-message store.';
