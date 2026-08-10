-- WP13.2B: least-privilege grants and safe search paths for SECURITY DEFINER RPCs.
-- This migration deliberately contains no business-logic or schema/data changes.

-- The legacy overloads have no database dependents, RLS policy references, or
-- application call sites. Do not use CASCADE: a newly introduced dependency must
-- fail this migration rather than being removed implicitly.
drop function if exists public.customer_decide_quote(uuid, public.quote_status, text);
drop function if exists public.customer_question_quote(uuid, text);
drop function if exists public.finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text);
drop function if exists public.get_public_quote(uuid);
drop function if exists public.publish_quote_for_customer(uuid, integer);
drop function if exists public.start_ai_run(uuid, text, text);

-- Pin the lookup path without rewriting any function body. pg_temp is deliberately
-- listed last so it cannot shadow objects used by a SECURITY DEFINER function.
alter function public.add_company_member_by_email(uuid, text, public.company_role) set search_path = public, pg_temp;
alter function public.bootstrap_company(text, text) set search_path = public, pg_temp;
alter function public.complete_quote_email_delivery(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) set search_path = public, pg_temp;
alter function public.create_company_defaults() set search_path = public, pg_temp;
alter function public.create_invoice_from_quote(uuid, uuid) set search_path = public, pg_temp;
alter function public.customer_decide_quote(text, public.quote_status, text) set search_path = public, pg_temp;
alter function public.customer_question_quote(text, text) set search_path = public, pg_temp;
alter function public.fail_quote_email_delivery(uuid, uuid, text) set search_path = public, pg_temp;
alter function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, text, integer, integer, integer, integer, integer, character, text, text) set search_path = public, pg_temp;
alter function public.get_public_quote(text) set search_path = public, pg_temp;
alter function public.has_company_role(uuid, public.company_role[]) set search_path = public, pg_temp;
alter function public.is_company_member(uuid) set search_path = public, pg_temp;
alter function public.publish_quote_for_customer(uuid, uuid, integer) set search_path = public, pg_temp;
alter function public.reserve_quote_email_delivery(uuid, uuid, text, text, uuid) set search_path = public, pg_temp;
alter function public.revoke_public_quote_token(uuid, uuid) set search_path = public, pg_temp;
alter function public.rotate_public_quote_token(uuid, uuid, integer) set search_path = public, pg_temp;
alter function public.start_ai_run(uuid, uuid, text, text, jsonb, text, text) set search_path = public, pg_temp;
alter function public.transition_invoice_status(uuid, uuid, text, text) set search_path = public, pg_temp;
alter function public.update_draft_quote(uuid, uuid, text, text, jsonb) set search_path = public, pg_temp;

-- Reset every remaining function ACL before granting its exact, minimal audience.
revoke all on function public.add_company_member_by_email(uuid, text, public.company_role) from public, anon, authenticated, service_role;
revoke all on function public.bootstrap_company(text, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_quote_email_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_company_defaults() from public, anon, authenticated, service_role;
revoke all on function public.create_invoice_from_quote(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.customer_decide_quote(text, public.quote_status, text) from public, anon, authenticated, service_role;
revoke all on function public.customer_question_quote(text, text) from public, anon, authenticated, service_role;
revoke all on function public.fail_quote_email_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, text, integer, integer, integer, integer, integer, character, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_public_quote(text) from public, anon, authenticated, service_role;
revoke all on function public.has_company_role(uuid, public.company_role[]) from public, anon, authenticated, service_role;
revoke all on function public.is_company_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.publish_quote_for_customer(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.reserve_quote_email_delivery(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_public_quote_token(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.rotate_public_quote_token(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.start_ai_run(uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.transition_invoice_status(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_draft_quote(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;

-- Public quote capabilities: a valid hashed token is the capability. Both roles are
-- required because an authenticated visitor may open the same public link.
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.customer_decide_quote(text, public.quote_status, text) to anon, authenticated;
grant execute on function public.customer_question_quote(text, text) to anon, authenticated;

-- User-initiated operations: each function retains its existing auth and tenant checks.
grant execute on function public.add_company_member_by_email(uuid, text, public.company_role) to authenticated;
grant execute on function public.bootstrap_company(text, text) to authenticated;
grant execute on function public.create_ai_quote_draft(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.create_invoice_from_quote(uuid, uuid) to authenticated;
grant execute on function public.publish_quote_for_customer(uuid, uuid, integer) to authenticated;
grant execute on function public.reserve_quote_email_delivery(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.revoke_public_quote_token(uuid, uuid) to authenticated;
grant execute on function public.rotate_public_quote_token(uuid, uuid, integer) to authenticated;
grant execute on function public.transition_invoice_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_draft_quote(uuid, uuid, text, text, jsonb) to authenticated;

-- RLS helper functions are callable only while evaluating authenticated tenant policies.
grant execute on function public.has_company_role(uuid, public.company_role[]) to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;

-- Server-only operations are invoked exclusively through the server-only admin client.
grant execute on function public.complete_quote_email_delivery(uuid, uuid, text) to service_role;
grant execute on function public.fail_quote_email_delivery(uuid, uuid, text) to service_role;
grant execute on function public.finish_ai_run(uuid, public.ai_run_status, uuid, text, text, integer, integer, integer, integer, integer, character, text, text) to service_role;
grant execute on function public.start_ai_run(uuid, uuid, text, text, jsonb, text, text) to service_role;
