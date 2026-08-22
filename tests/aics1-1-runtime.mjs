/**
 * AICS1.1 local-only runtime proof.
 *
 * This harness resets only the local Supabase stack, creates two synthetic
 * tenants, and proves module gating, tenant isolation, direct-mutation denial,
 * revoke preservation and deterministic mock behavior. It never uses --linked.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { classifySupportIntent, createDeterministicMockReply } from "../src/ai/customer-service.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A = "aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb";
const CONVERSATION_A = "aaaaaaaa-aaa2-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSATION_B = "bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb";
const MESSAGE_A = "aaaaaaaa-aaa3-4aaa-8aaa-aaaaaaaaaaaa";
const MESSAGE_B = "bbbbbbbb-bbb3-4bbb-8bbb-bbbbbbbbbbbb";
const KNOWLEDGE_A = "aaaaaaaa-aaa4-4aaa-8aaa-aaaaaaaaaaaa";
const KNOWLEDGE_B = "bbbbbbbb-bbb4-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_A = "aaaaaaaa-aaa5-4aaa-8aaa-aaaaaaaaaaaa";
const DRAFT_A = "aaaaaaaa-aaa6-4aaa-8aaa-aaaaaaaaaaaa";

function run(command, args, input) {
  return execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}
function npx(args) {
  return process.platform === "win32" ? run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npx ${args.join(" ")}`]) : run("npx", args);
}
function parseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(?:export )?([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const databaseContainer = run("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).trim().split(/\r?\n/)[0];
assert.ok(databaseContainer, "A local Supabase database container is required");
function sql(statement) {
  return run("docker", ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", statement]);
}
function jwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ aud: "authenticated", role: "authenticated", sub: userId, iat: now, exp: now + 300 });
  return `${header}.${payload}.${createHmac("sha256", environment.JWT_SECRET).update(`${header}.${payload}`).digest("base64url")}`;
}
async function api(userId, path, init = {}) {
  const response = await fetch(`${environment.API_URL}/rest/v1${path}`, {
    ...init,
    headers: { apikey: environment.ANON_KEY, Authorization: `Bearer ${jwt(userId)}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* status assertions are enough */ }
  return { status: response.status, body };
}
async function rpc(userId, name, body) {
  return api(userId, `/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

let environment;
try {
  npx(["supabase", "db", "reset", "--local", "--no-seed"]);
  environment = parseEnv(npx(["supabase", "status", "--output", "env"]));
  assert.ok(environment.API_URL && environment.ANON_KEY && environment.JWT_SECRET, "Local Supabase API configuration is incomplete");

  sql(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('${USER_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aics-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${USER_B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aics-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    insert into public.users (id, email, full_name) values
      ('${USER_A}', 'aics-a@example.test', 'AICS Owner A'),
      ('${USER_B}', 'aics-b@example.test', 'AICS Owner B');
    insert into public.companies (id, name, slug) values
      ('${COMPANY_A}', 'AICS Tenant A', 'aics-a'),
      ('${COMPANY_B}', 'AICS Tenant B', 'aics-b');
    insert into public.company_memberships (company_id, user_id, role) values
      ('${COMPANY_A}', '${USER_A}', 'owner'),
      ('${COMPANY_B}', '${USER_B}', 'owner');
    insert into public.customers (id, company_id, name, created_by) values
      ('${CUSTOMER_A}', '${COMPANY_A}', 'AICS Customer A', '${USER_A}'),
      ('${CUSTOMER_B}', '${COMPANY_B}', 'AICS Customer B', '${USER_B}');
    insert into public.conversations (id, company_id, customer_id, channel, subject) values
      ('${CONVERSATION_A}', '${COMPANY_A}', '${CUSTOMER_A}', 'web', 'AICS vraag A'),
      ('${CONVERSATION_B}', '${COMPANY_B}', '${CUSTOMER_B}', 'web', 'AICS vraag B');
    insert into public.conversation_messages (id, conversation_id, company_id, author_user_id, direction, body) values
      ('${MESSAGE_A}', '${CONVERSATION_A}', '${COMPANY_A}', '${USER_A}', 'inbound', 'Welke onderhoudsbeurt bieden jullie aan?'),
      ('${MESSAGE_B}', '${CONVERSATION_B}', '${COMPANY_B}', '${USER_B}', 'inbound', 'Welke onderhoudsbeurt bieden jullie aan?');
    insert into public.ai_knowledge_entries (id, company_id, title, content, source_type, is_enabled, is_approved, approved_by, approved_at, created_by)
      values ('${KNOWLEDGE_A}', '${COMPANY_A}', 'Onderhoud', 'Onderhoud is op afspraak beschikbaar.', 'manual', true, true, '${USER_A}', now(), '${USER_A}'),
             ('${KNOWLEDGE_B}', '${COMPANY_B}', 'Geheim B', 'Tenant B kennis.', 'manual', true, true, '${USER_B}', now(), '${USER_B}');
    insert into public.ai_runs (id, company_id, initiated_by, kind, status) values ('${RUN_A}', '${COMPANY_A}', '${USER_A}', 'reply_draft', 'succeeded');
    insert into public.ai_reply_drafts (id, company_id, conversation_id, source_message_id, ai_run_id, body, created_by)
      values ('${DRAFT_A}', '${COMPANY_A}', '${CONVERSATION_A}', '${MESSAGE_A}', '${RUN_A}', 'Bedankt voor uw bericht.', '${USER_A}');
    insert into public.ai_conversation_state (company_id, conversation_id, latest_intent) values ('${COMPANY_A}', '${CONVERSATION_A}', 'product_service_question');
  `);

  assert.equal((await rpc(USER_A, "resolve_company_module_access", { target_company_id: COMPANY_A, target_module_key: "ai_customer_service" })).body, "MODULE_NOT_RELEASED");
  sql("update public.module_catalog set release_state = 'released' where module_key = 'ai_customer_service';");
  assert.equal((await rpc(USER_A, "resolve_company_module_access", { target_company_id: COMPANY_A, target_module_key: "ai_customer_service" })).body, "MODULE_NOT_ENTITLED");
  sql(`insert into public.company_module_entitlements (company_id, module_key, source) values ('${COMPANY_A}', 'ai_customer_service', 'aics_local_runtime');`);
  assert.equal((await rpc(USER_A, "resolve_company_module_access", { target_company_id: COMPANY_A, target_module_key: "ai_customer_service" })).body, "MODULE_AVAILABLE");
  assert.equal((await rpc(USER_B, "resolve_company_module_access", { target_company_id: COMPANY_B, target_module_key: "ai_customer_service" })).body, "MODULE_NOT_ENTITLED");

  assert.equal((await api(USER_A, `/ai_knowledge_entries?id=eq.${KNOWLEDGE_A}&select=id,company_id`)).status, 200);
  assert.equal((await api(USER_A, `/ai_knowledge_entries?id=eq.${KNOWLEDGE_B}&select=id`)).body.length, 0);
  assert.equal((await api(USER_B, `/ai_reply_drafts?id=eq.${DRAFT_A}&select=id`)).body.length, 0);
  assert.ok((await api(USER_A, "/ai_reply_drafts", { method: "POST", body: JSON.stringify({ company_id: COMPANY_A, conversation_id: CONVERSATION_A, body: "direct write", created_by: USER_A }) })).status >= 400);
  assert.ok((await api(USER_A, `/ai_reply_drafts?id=eq.${DRAFT_A}`, { method: "PATCH", body: JSON.stringify({ body: "direct update" }) })).status >= 400);

  sql(`update public.company_module_entitlements set is_enabled = false, revoked_at = now() where company_id = '${COMPANY_A}' and module_key = 'ai_customer_service';`);
  assert.equal((await api(USER_A, `/ai_knowledge_entries?id=eq.${KNOWLEDGE_A}&select=id`)).body.length, 0);
  assert.equal(sql(`select count(*) from public.ai_reply_drafts where id='${DRAFT_A}' and company_id='${COMPANY_A}';`).trim(), "1");
  sql(`update public.company_module_entitlements set is_enabled = true, revoked_at = null where company_id = '${COMPANY_A}' and module_key = 'ai_customer_service';`);
  assert.equal((await api(USER_A, `/ai_knowledge_entries?id=eq.${KNOWLEDGE_A}&select=id`)).body.length, 1);

  assert.equal(classifySupportIntent("Ik wil mijn factuur bespreken"), "billing_question");
  assert.equal(createDeterministicMockReply("billing_question").requiresHumanReview, true);
  console.log("AICS1.1 local runtime proof: PASS");
} finally {
  npx(["supabase", "db", "reset", "--local", "--no-seed"]);
}
