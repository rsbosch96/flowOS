-- FlowOS backup/restore integrity snapshot.
-- Read-only by design. Run against the source and the isolated restored database.
-- The single JSON result is sensitive operational metadata; encrypt it outside the repository.
begin transaction read only;

with expected_tables(schema_name, table_name) as (
  values
    ('public', 'companies'),
    ('public', 'company_memberships'),
    ('public', 'customers'),
    ('public', 'quotes'),
    ('public', 'quote_items'),
    ('public', 'invoices'),
    ('public', 'invoice_items'),
    ('public', 'planning_events'),
    ('public', 'company_module_entitlements'),
    ('public', 'audit_logs'),
    ('public', 'rate_limit_windows')
),
table_state as (
  select jsonb_object_agg(
    format('%s.%s', e.schema_name, e.table_name),
    jsonb_build_object(
      'exists', to_regclass(format('%I.%I', e.schema_name, e.table_name)) is not null,
      'rlsEnabled', coalesce(c.relrowsecurity, false)
    )
  ) as value
  from expected_tables e
  left join pg_namespace n on n.nspname = e.schema_name
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name and c.relkind = 'r'
),
policy_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', schemaname, 'table', tablename, 'name', policyname,
    'command', cmd, 'roles', roles, 'using', qual, 'check', with_check
  ) order by schemaname, tablename, policyname), '[]'::jsonb) as value
  from pg_policies
  where schemaname in ('public', 'storage')
),
function_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'name', p.proname,
    'identityArguments', pg_get_function_identity_arguments(p.oid),
    'securityDefiner', p.prosecdef, 'config', coalesce(p.proconfig, array[]::text[])
  ) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb) as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'storage')
),
trigger_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'table', c.relname, 'name', t.tgname,
    'function', pn.nspname || '.' || p.proname,
    'definition', pg_get_triggerdef(t.oid, true)
  ) order by n.nspname, c.relname, t.tgname), '[]'::jsonb) as value
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal and n.nspname in ('public', 'storage')
),
acl_state as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', table_schema, 'table', table_name, 'grantee', grantee, 'privilege', privilege_type
  ) order by table_schema, table_name, grantee, privilege_type), '[]'::jsonb) as value
  from information_schema.role_table_grants
  where table_schema in ('public', 'storage')
    and grantee in ('anon', 'authenticated', 'service_role')
),
ledger_state as (
  select coalesce(jsonb_agg(version order by version), '[]'::jsonb) as value
  from supabase_migrations.schema_migrations
),
row_counts as (
  select jsonb_build_object(
    'companies', (select count(*) from public.companies),
    'companyMemberships', (select count(*) from public.company_memberships),
    'customers', (select count(*) from public.customers),
    'quotes', (select count(*) from public.quotes),
    'quoteItems', (select count(*) from public.quote_items),
    'invoices', (select count(*) from public.invoices),
    'invoiceItems', (select count(*) from public.invoice_items),
    'planningEvents', (select count(*) from public.planning_events),
    'companyModuleEntitlements', (select count(*) from public.company_module_entitlements),
    'auditLogs', (select count(*) from public.audit_logs)
  ) as value
),
financial_state as (
  select jsonb_build_object(
    'invoiceTotalInvariantFailures', (select count(*) from public.invoices where total_cents <> subtotal_cents + tax_cents),
    'quoteTotalInvariantFailures', (select count(*) from public.quotes where total_cents <> subtotal_cents + tax_cents),
    'invoiceFingerprintSha256', (select encode(extensions.digest(coalesce(string_agg(to_jsonb(i)::text, E'\n' order by i.id::text), ''), 'sha256'::text), 'hex') from public.invoices i),
    'invoiceItemFingerprintSha256', (select encode(extensions.digest(coalesce(string_agg(to_jsonb(ii)::text, E'\n' order by ii.id::text), ''), 'sha256'::text), 'hex') from public.invoice_items ii),
    'quoteFingerprintSha256', (select encode(extensions.digest(coalesce(string_agg(to_jsonb(q)::text, E'\n' order by q.id::text), ''), 'sha256'::text), 'hex') from public.quotes q),
    'quoteItemFingerprintSha256', (select encode(extensions.digest(coalesce(string_agg(to_jsonb(qi)::text, E'\n' order by qi.id::text), ''), 'sha256'::text), 'hex') from public.quote_items qi)
  ) as value
),
relationship_state as (
  select jsonb_build_object(
    'quotesWithCustomerTenantMismatch', (select count(*) from public.quotes q join public.customers c on c.id = q.customer_id where q.company_id <> c.company_id),
    'invoicesWithCustomerTenantMismatch', (select count(*) from public.invoices i join public.customers c on c.id = i.customer_id where i.company_id <> c.company_id),
    'planningWithCustomerTenantMismatch', (select count(*) from public.planning_events p join public.customers c on c.id = p.customer_id where p.customer_id is not null and p.company_id <> c.company_id),
    'planningWithQuoteTenantMismatch', (select count(*) from public.planning_events p join public.quotes q on q.id = p.quote_id where p.quote_id is not null and p.company_id <> q.company_id),
    'entitlementsWithoutCompany', (select count(*) from public.company_module_entitlements e left join public.companies c on c.id = e.company_id where c.id is null)
  ) as value
),
auth_state as (
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'identities', (select count(*) from auth.identities),
    'usersFingerprintSha256', (select encode(extensions.digest(coalesce(string_agg((to_jsonb(u) - array['last_sign_in_at', 'updated_at', 'last_token_issued_at', 'confirmation_sent_at', 'recovery_sent_at', 'email_change_sent_at', 'phone_change_sent_at'])::text, E'\n' order by u.id::text), ''), 'sha256'::text), 'hex') from auth.users u)
  ) as value
)
select jsonb_build_object(
  'format', 'flowos-integrity-snapshot',
  'formatVersion', 1,
  'capturedAt', now(),
  'migrationLedger', ledger_state.value,
  'objects', table_state.value,
  'security', jsonb_build_object('policies', policy_state.value, 'functions', function_state.value, 'triggers', trigger_state.value, 'tableAcl', acl_state.value),
  'rowCounts', row_counts.value,
  'financial', financial_state.value,
  'relationships', relationship_state.value,
  'auth', auth_state.value
) as integrity_snapshot
from table_state, policy_state, function_state, trigger_state, acl_state, ledger_state, row_counts, financial_state, relationship_state, auth_state;

commit;
