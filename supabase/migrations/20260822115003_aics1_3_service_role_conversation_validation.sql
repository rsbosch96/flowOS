-- AICS1.3: allow the server-only integrity trigger to validate tenant links.
grant select (id, company_id)
on public.conversations
to service_role;

grant select (id, conversation_id, company_id)
on public.conversation_messages
to service_role;

grant select (company_id, user_id)
on public.company_memberships
to service_role;
