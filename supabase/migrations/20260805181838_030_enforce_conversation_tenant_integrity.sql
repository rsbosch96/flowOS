-- WP13.3: messages must belong to the same tenant as their conversation.
-- No data is modified. Abort rather than repairing unexpected legacy data.
do $$
begin
  if exists (
    select 1
    from public.conversation_messages message
    left join public.conversations conversation on conversation.id = message.conversation_id
    where conversation.id is null
  ) then
    raise exception 'CONVERSATION_TENANT_INTEGRITY_ORPHANS_FOUND';
  end if;

  if exists (
    select 1
    from public.conversation_messages message
    join public.conversations conversation on conversation.id = message.conversation_id
    where message.company_id is distinct from conversation.company_id
  ) then
    raise exception 'CONVERSATION_TENANT_INTEGRITY_MISMATCHES_FOUND';
  end if;
end;
$$;

-- Required as the referenced key for the composite tenant foreign key.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_id_company_id_key'
  ) then
    alter table public.conversations
      add constraint conversations_id_company_id_key unique (id, company_id);
  end if;
end;
$$;

-- The old FK only checked that the conversation existed. Replacing it is necessary
-- to make the tenant relation mandatory. This does not use DROP ... CASCADE.
alter table public.conversation_messages
  drop constraint if exists conversation_messages_conversation_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversation_messages'::regclass
      and conname = 'conversation_messages_conversation_company_id_fkey'
  ) then
    alter table public.conversation_messages
      add constraint conversation_messages_conversation_company_id_fkey
      foreign key (conversation_id, company_id)
      references public.conversations (id, company_id)
      on update no action
      on delete cascade;
  end if;
end;
$$;

-- Supports the composite FK checks and tenant-scoped message lookups.
create index if not exists conversation_messages_conversation_company_idx
  on public.conversation_messages (conversation_id, company_id);

comment on constraint conversation_messages_conversation_company_id_fkey on public.conversation_messages is
  'Enforces that each message has the same company_id as its conversation. ON DELETE CASCADE preserves the pre-existing conversation-message deletion behaviour; ON UPDATE NO ACTION prevents reassignment.';
