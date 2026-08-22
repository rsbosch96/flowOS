import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const sql = String.raw;

// This proof is intentionally local-only. It refuses linked targets and all
// URL/key overrides so it cannot touch staging or production.
if (process.argv.includes("--linked") || process.env.SUPABASE_DB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("AICS1.3 hardening proof refuses non-local configuration.");
}

const container = (await execFileAsync("docker", ["ps", "--format", "{{.Names}}"], { windowsHide: true })).stdout
  .split(/\r?\n/).find((name) => name.startsWith("supabase_db_"));
if (!container) throw new Error("Local Supabase database container was not found.");

async function runSql(statement, { expectFailure = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "flowos-aics13-hardening-"));
  const file = join(dir, "proof.sql");
  await writeFile(file, statement, "utf8");
  try {
    return await execFileAsync("docker", ["cp", file, `${container}:/tmp/aics13-hardening.sql`], { windowsHide: true })
      .then(() => execFileAsync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/aics13-hardening.sql"], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }))
      .catch((error) => {
        if (expectFailure) return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", failed: true };
        throw error;
      });
  } finally {
    await execFileAsync("docker", ["exec", container, "rm", "-f", "/tmp/aics13-hardening.sql"], { windowsHide: true }).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

function fixture() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return {
    company: `10000000-0000-4000-8000-${suffix.padEnd(12, "0")}`,
    user: `20000000-0000-4000-8000-${suffix.padEnd(12, "1")}`,
    customer: `30000000-0000-4000-8000-${suffix.padEnd(12, "2")}`,
    conversation: `40000000-0000-4000-8000-${suffix.padEnd(12, "3")}`,
    message: `50000000-0000-4000-8000-${suffix.padEnd(12, "4")}`,
  };
}

async function setup(f) {
  await runSql(sql`
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, is_sso_user, is_anonymous)
values ('${f.user}', 'authenticated', 'authenticated', 'aics13-hardening-${f.user.slice(-6)}@local.test', now(), now(), now(), false, false);
insert into public.users (id, email, full_name)
values ('${f.user}', 'aics13-hardening-${f.user.slice(-6)}@local.test', 'AICS13 hardening owner');
insert into public.companies (id, name, slug, address)
values ('${f.company}', 'AICS13 hardening tenant', 'aics13-hardening-${f.user.slice(-6)}', '{}'::jsonb);
insert into public.company_memberships (company_id, user_id, role)
values ('${f.company}', '${f.user}', 'owner');
insert into public.customers (id, company_id, name, created_by)
values ('${f.customer}', '${f.company}', 'AICS13 hardening customer', '${f.user}');
insert into public.conversations (id, company_id, customer_id, channel, subject)
values ('${f.conversation}', '${f.company}', '${f.customer}', 'web', 'AICS13 concurrency proof');
insert into public.conversation_messages (id, conversation_id, company_id, direction, body)
values ('${f.message}', '${f.conversation}', '${f.company}', 'inbound', 'AICS hardening runtime message');
update public.module_catalog set release_state = 'released' where module_key = 'ai_customer_service';
insert into public.company_module_entitlements (company_id, module_key, source, is_enabled)
values ('${f.company}', 'ai_customer_service', 'local_hardening', true);
insert into public.ai_conversation_state (company_id, conversation_id, ownership_state, escalation_state, latest_intent)
values ('${f.company}', '${f.conversation}', 'ai_assisted', 'none', 'general_question');
commit;
`);
}

async function cleanup(f) {
  await runSql(sql`
begin;
delete from public.audit_logs where company_id = '${f.company}';
delete from public.ai_reply_drafts where company_id = '${f.company}';
delete from public.ai_conversation_state where company_id = '${f.company}';
delete from public.conversation_messages where company_id = '${f.company}';
delete from public.conversations where company_id = '${f.company}';
delete from public.customers where company_id = '${f.company}';
delete from public.company_module_entitlements where company_id = '${f.company}';
delete from public.company_memberships where company_id = '${f.company}';
delete from public.users where id = '${f.user}';
delete from auth.users where id = '${f.user}';
delete from public.companies where id = '${f.company}';
update public.module_catalog set release_state = 'planned' where module_key = 'ai_customer_service';
commit;
`);
}

async function takeoverFirst() {
  const f = fixture();
  await setup(f);
  try {
    const takeover = runSql(sql`
begin;
select conversation_id from public.ai_conversation_state where conversation_id='${f.conversation}' for update;
select pg_sleep(3);
do $$ declare transition jsonb; begin
  select public.takeover_ai_conversation('${f.company}', '${f.conversation}', '${f.user}') into transition;
  if (transition->>'transitioned' = 'true') then
    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
    values ('${f.company}', '${f.user}', 'ai_customer_service.human_takeover', 'conversation', '${f.conversation}', jsonb_build_object('status', 'human_owned'));
  end if;
end $$;
select pg_sleep(1);
commit;
`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const generation = await runSql(sql`select public.create_ai_reply_draft('${f.company}', '${f.conversation}', '${f.message}', null, 'should not persist', '${f.user}', 'general_question', true);`, { expectFailure: true });
    await Promise.all([takeover, generation]);
    if (!generation.failed || !`${generation.stderr}${generation.stdout}`.includes("AICS_HUMAN_OWNED")) {
      throw new Error(`Takeover-first generation did not fail with AICS_HUMAN_OWNED: ${generation.stderr ?? generation.stdout ?? "no output"}`);
    }
    const result = await runSql(sql`select ownership_state, (select count(*) from public.ai_reply_drafts where conversation_id='${f.conversation}') as drafts, (select count(*) from public.audit_logs where entity_id='${f.conversation}' and action='ai_customer_service.human_takeover') as takeovers from public.ai_conversation_state where conversation_id='${f.conversation}';`);
    if (!result.stdout.replace(/\s+/g, "").includes("human_owned|0|1")) throw new Error(`Unexpected takeover-first result: ${result.stdout}`);
    console.log("takeover-first: generation aborted, no draft, one takeover audit");
  } finally { await cleanup(f); }
}

async function generationFirst() {
  const f = fixture();
  await setup(f);
  try {
    const generation = runSql(sql`
begin;
select conversation_id from public.ai_conversation_state where conversation_id='${f.conversation}' for update;
select public.create_ai_reply_draft('${f.company}', '${f.conversation}', '${f.message}', null, 'draft before takeover', '${f.user}', 'general_question', true);
select pg_sleep(3);
commit;
`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const takeover = runSql(sql`
begin;
do $$ declare transition jsonb; begin
  select public.takeover_ai_conversation('${f.company}', '${f.conversation}', '${f.user}') into transition;
  if (transition->>'transitioned' = 'true') then
    insert into public.audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
    values ('${f.company}', '${f.user}', 'ai_customer_service.human_takeover', 'conversation', '${f.conversation}', jsonb_build_object('status', 'human_owned'));
  end if;
end $$;
commit;
`);
    await Promise.all([generation, takeover]);
    const result = await runSql(sql`select ownership_state, (select count(*) from public.ai_reply_drafts where conversation_id='${f.conversation}') as drafts, (select count(*) from public.audit_logs where metadata->>'conversation_id'='${f.conversation}' and action='ai_customer_service.draft_generated') as generated, (select count(*) from public.audit_logs where entity_id='${f.conversation}' and action='ai_customer_service.human_takeover') as takeovers, (select min(occurred_at) from public.audit_logs where metadata->>'conversation_id'='${f.conversation}' and action='ai_customer_service.draft_generated') <= (select min(occurred_at) from public.audit_logs where entity_id='${f.conversation}' and action='ai_customer_service.human_takeover') as ordered from public.ai_conversation_state where conversation_id='${f.conversation}';`);
    if (!result.stdout.replace(/\s+/g, "").includes("human_owned|1|1|1|t")) throw new Error(`Unexpected generation-first result: ${result.stdout}`);
    console.log("generation-first: draft committed before takeover, one audit each");
  } finally { await cleanup(f); }
}

await takeoverFirst();
await takeoverFirst();
await generationFirst();
console.log("AICS1.3 hardening local runtime proof passed: repeated takeover/generation races serialize at the database boundary.");
