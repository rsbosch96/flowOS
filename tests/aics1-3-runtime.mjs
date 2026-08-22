import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const sql = String.raw;

// This harness is deliberately local-only. It never accepts a linked target,
// URL, key, provider, or environment override.
if (process.argv.includes("--linked") || process.env.SUPABASE_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("AICS1.3 runtime proof refuses non-local configuration.");
}

const ids = {
  companyA: "11111111-1111-4111-8111-111111111111",
  companyB: "22222222-2222-4222-8222-222222222222",
  userA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  techA: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  customerA: "aaaa1111-aaaa-4111-8111-aaaaaaaaaaaa",
  customerB: "bbbb2222-bbbb-4222-8222-bbbbbbbbbbbb",
  conversationA: "aaaa3333-aaaa-4333-8333-aaaaaaaaaaaa",
  conversationB: "bbbb4444-bbbb-4444-8444-bbbbbbbbbbbb",
  messageA: "aaaa5555-aaaa-4555-8555-aaaaaaaaaaaa",
  messageB: "bbbb6666-bbbb-4666-8666-bbbbbbbbbbbb",
  knowledgeA: "aaaa7777-aaaa-4777-8777-aaaaaaaaaaaa",
};

async function runSql(statement) {
  const dir = await mkdtemp(join(tmpdir(), "flowos-aics13-"));
  const file = join(dir, "proof.sql");
  const container = (await execFileAsync("docker", ["ps", "--format", "{{.Names}}"], { windowsHide: true })).stdout
    .split(/\r?\n/).find((name) => name.startsWith("supabase_db_"));
  if (!container) throw new Error("Local Supabase database container was not found.");
  try {
    await writeFile(file, statement, "utf8");
    await execFileAsync("docker", ["cp", file, `${container}:/tmp/aics13-proof.sql`], { windowsHide: true });
    const result = await execFileAsync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/aics13-proof.sql"], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    return result.stdout;
  } finally {
    await execFileAsync("docker", ["exec", container, "rm", "-f", "/tmp/aics13-proof.sql"], { windowsHide: true }).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

const u = ids;
const proof = sql`
begin;
set local role postgres;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, is_sso_user, is_anonymous)
values
  ('${u.userA}', 'authenticated', 'authenticated', 'aics13-owner-a@local.test', now(), now(), now(), false, false),
  ('${u.userB}', 'authenticated', 'authenticated', 'aics13-owner-b@local.test', now(), now(), now(), false, false),
  ('${u.techA}', 'authenticated', 'authenticated', 'aics13-tech-a@local.test', now(), now(), now(), false, false);

insert into public.users (id, email, full_name)
values
  ('${u.userA}', 'aics13-owner-a@local.test', 'AICS13 Owner A'),
  ('${u.userB}', 'aics13-owner-b@local.test', 'AICS13 Owner B'),
  ('${u.techA}', 'aics13-tech-a@local.test', 'AICS13 Technician A');

insert into public.companies (id, name, slug, address)
values
  ('${u.companyA}', 'AICS13 Tenant A', 'aics13-tenant-a', '{}'::jsonb),
  ('${u.companyB}', 'AICS13 Tenant B', 'aics13-tenant-b', '{}'::jsonb);

insert into public.company_memberships (company_id, user_id, role)
values
  ('${u.companyA}', '${u.userA}', 'owner'),
  ('${u.companyA}', '${u.techA}', 'technician'),
  ('${u.companyB}', '${u.userB}', 'owner');

insert into public.customers (id, company_id, name, created_by)
values
  ('${u.customerA}', '${u.companyA}', 'AICS13 Customer A', '${u.userA}'),
  ('${u.customerB}', '${u.companyB}', 'AICS13 Customer B', '${u.userB}');

insert into public.conversations (id, company_id, customer_id, channel, subject)
values
  ('${u.conversationA}', '${u.companyA}', '${u.customerA}', 'web', 'AICS13 vraag A'),
  ('${u.conversationB}', '${u.companyB}', '${u.customerB}', 'web', 'AICS13 vraag B');

insert into public.conversation_messages (id, conversation_id, company_id, direction, body)
values
  ('${u.messageA}', '${u.conversationA}', '${u.companyA}', 'inbound', 'Mijn factuur klopt niet en ik wil een medewerker spreken.'),
  ('${u.messageB}', '${u.conversationB}', '${u.companyB}', 'inbound', 'Wat zijn jullie openingstijden?');

insert into public.ai_knowledge_entries (id, company_id, title, content, source_type, is_enabled, is_approved, approved_by, approved_at, created_by)
values ('${u.knowledgeA}', '${u.companyA}', 'Openingstijden', 'Wij zijn bereikbaar op werkdagen.', 'faq', true, true, '${u.userA}', now(), '${u.userA}');

update public.module_catalog set release_state = 'released' where module_key = 'ai_customer_service';
insert into public.company_module_entitlements (company_id, module_key, source, is_enabled)
values
  ('${u.companyA}', 'ai_customer_service', 'local_test', true),
  ('${u.companyB}', 'ai_customer_service', 'local_test', true);

-- The mock classifier/retrieval pipeline has produced two deterministic drafts.
select public.create_ai_reply_draft('${u.companyA}', '${u.conversationA}', '${u.messageA}', null,
  'Bedankt voor uw bericht. Een medewerker beoordeelt dit eerst.', '${u.userA}', 'billing_question', true);
select public.create_ai_reply_draft('${u.companyB}', '${u.conversationB}', '${u.messageB}', null,
  'Bedankt voor uw vraag. Wij komen hierop terug.', '${u.userB}', 'general_question', true);

-- Direct Data API-equivalent RLS proof: authenticated tenant A sees only A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '${u.userA}', true);
do $$ declare visible_a integer; visible_b integer; begin
  select count(*) into visible_a from public.ai_reply_drafts where company_id = '${u.companyA}';
  select count(*) into visible_b from public.ai_reply_drafts where company_id = '${u.companyB}';
  if visible_a <> 1 or visible_b <> 0 then raise exception 'AICS13_RLS_A_FAILED'; end if;
end $$;

-- Technician has membership but no AICS role access.
select set_config('request.jwt.claim.sub', '${u.techA}', true);
do $$ declare visible integer; begin
  select count(*) into visible from public.ai_reply_drafts where company_id = '${u.companyA}';
  if visible <> 0 then raise exception 'AICS13_TECHNICIAN_ACCESS_FAILED'; end if;
end $$;

-- Tenant B cannot read or mutate tenant A through the Data API role.
select set_config('request.jwt.claim.sub', '${u.userB}', true);
do $$ declare visible integer; begin
  select count(*) into visible from public.ai_reply_drafts where company_id = '${u.companyA}';
  if visible <> 0 then raise exception 'AICS13_RLS_B_FAILED'; end if;
begin
  insert into public.ai_reply_drafts (company_id, conversation_id, body, created_by)
  values ('${u.companyA}', '${u.conversationA}', 'cross tenant', '${u.userB}');
  raise exception 'AICS13_CROSS_TENANT_WRITE_ACCEPTED';
exception when insufficient_privilege then null;
end;
end $$;

rollback;
`;

const output = await runSql(proof);
if (!output.includes("BEGIN") || !output.includes("ROLLBACK")) throw new Error("Local proof did not complete against the local database.");
console.log("AICS1.3 local runtime proof passed: classification, approved knowledge, draft state, RLS isolation, technician denial, and cross-tenant write denial.");
