-- PRR2D: make the post-034 security state independent of Supabase platform defaults.
-- This migration contains no business-data changes.

-- The AI Gateway is the only writer of AI runs. Keep the existing tenant read policy.
drop policy if exists "tenant ai runs insert" on public.ai_runs;
drop policy if exists "tenant ai runs update" on public.ai_runs;

-- Future public-schema objects must never inherit Data API access accidentally.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

grant usage on schema public to anon, authenticated, service_role;

-- Reset existing table grants first, then grant only what the current application uses.
revoke all privileges on table
  public.ai_runs,
  public.audit_logs,
  public.companies,
  public.company_memberships,
  public.conversation_messages,
  public.conversations,
  public.customers,
  public.document_extractions,
  public.documents,
  public.invoice_items,
  public.invoice_number_counters,
  public.invoices,
  public.product_catalog_items,
  public.quote_approval_rules,
  public.quote_email_deliveries,
  public.quote_items,
  public.quote_templates,
  public.quotes,
  public.rate_limit_windows,
  public.subscriptions,
  public.tasks,
  public.users
from anon, authenticated, service_role;

-- Anonymous access is only needed for the database liveness probe. RLS returns no rows.
grant select on table public.companies to anon;

-- Authenticated browser/server-session access. RLS remains the tenant authority.
grant select on table
  public.ai_runs,
  public.companies,
  public.company_memberships,
  public.conversation_messages,
  public.conversations,
  public.customers,
  public.documents,
  public.invoice_items,
  public.invoices,
  public.product_catalog_items,
  public.quote_approval_rules,
  public.quote_items,
  public.quote_templates,
  public.quotes,
  public.subscriptions,
  public.tasks,
  public.users
to authenticated;

grant insert on table
  public.conversation_messages,
  public.conversations,
  public.customers,
  public.documents,
  public.product_catalog_items,
  public.tasks
to authenticated;

grant update on table
  public.companies,
  public.company_memberships,
  public.conversations,
  public.customers,
  public.product_catalog_items,
  public.quote_templates,
  public.quotes,
  public.tasks,
  public.users
to authenticated;

grant delete on table
  public.company_memberships,
  public.documents,
  public.tasks
to authenticated;

-- Direct server-only data access is deliberately limited to the two current uses.
grant select, update on table public.ai_runs to service_role;
grant insert on table public.audit_logs to service_role;

-- The token hash is an internal helper; public quote capabilities remain the three
-- explicitly granted RPCs from migration 029.
revoke all on function public.hash_public_quote_token(text)
  from public, anon, authenticated, service_role;
