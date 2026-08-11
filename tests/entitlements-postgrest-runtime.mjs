/**
 * ENT1 local runtime proof.
 *
 * This intentionally talks to the local PostgREST/Data API with signed test
 * JWTs. It proves that RLS denies a valid member without Planning, then proves
 * revoke/re-grant preserves the same planning data. It never targets a linked
 * Supabase project. Run with: node tests/entitlements-postgrest-runtime.mjs
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A = "aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE_A = "aaaaaaaa-aaa2-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_B = "bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb";
const CORE_QUOTE_B = "bbbbbbbb-bbb3-4bbb-8bbb-bbbbbbbbbbbb";

function run(command, args, input, shell = false) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    shell,
  });
}

const runNpx = (args) => {
  if (process.platform !== "win32") return run("npx", args);
  // Arguments in this test are fixed literals. Calling cmd.exe directly avoids
  // Node's Windows .cmd shell warning while keeping the test cross-platform.
  const command = `npx ${args.join(" ")}`;
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command]);
};

function sql(statement) {
  return run("docker", ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", statement]);
}

function parseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(?:export )?([A-Z0-9_]+)=(.*)$/);
    if (!match) return [];
    const value = match[2].replace(/^['"]|['"]$/g, "");
    return [[match[1], value]];
  }));
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function userJwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ aud: "authenticated", role: "authenticated", sub: userId, iat: now, exp: now + 300 }));
  const signature = createHmac("sha256", environment.JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function dataApi(userId, path, init = {}) {
  const response = await fetch(`${environment.API_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: environment.ANON_KEY,
      Authorization: `Bearer ${userJwt(userId)}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* response body is only used for assertions */ }
  return { status: response.status, body };
}

const databaseContainer = run("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"])
  .trim()
  .split(/\r?\n/)[0];
assert.ok(databaseContainer, "Local Supabase database container is required");

// Start before ENT1 so the migration's existing-company bootstrap is proven.
// --no-reset is useful when the caller has just performed the same local reset
// and wants the HTTP proof without waiting for Docker services to restart.
if (!process.argv.includes("--no-reset")) {
  runNpx(["supabase", "db", "reset", "--local", "--no-seed", "--version", "20260810185630"]);
}
sql(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('${USER_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-ent-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('${USER_B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-ent-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.users (id, email, full_name) values
    ('${USER_A}', 'zzz-ent-a@example.test', 'ZZZ ENT User A'),
    ('${USER_B}', 'zzz-ent-b@example.test', 'ZZZ ENT User B');
  insert into public.companies (id, name, slug) values ('${COMPANY_A}', 'ZZZ ENT Existing A', 'zzz-ent-existing-a');
  insert into public.company_memberships (company_id, user_id, role) values ('${COMPANY_A}', '${USER_A}', 'owner');
  insert into public.customers (id, company_id, name, created_by) values ('${CUSTOMER_A}', '${COMPANY_A}', 'ZZZ ENT Customer A', '${USER_A}');
  insert into public.quotes (id, company_id, customer_id, quote_number, title, status, created_by, subtotal_cents, tax_cents, total_cents)
  values ('${QUOTE_A}', '${COMPANY_A}', '${CUSTOMER_A}', 'ZZZ-ENT-A', 'ZZZ ENT Quote A', 'accepted', '${USER_A}', 10000, 2100, 12100);
`);

runNpx(["supabase", "db", "push", "--local"]);
assert.equal(sql(`select count(*) from public.company_module_entitlements where company_id = '${COMPANY_A}' and module_key = 'planning' and is_enabled;`).trim(), "1", "Existing tenant was not bootstrapped with Planning");

sql(`
  insert into public.companies (id, name, slug) values ('${COMPANY_B}', 'ZZZ ENT New B', 'zzz-ent-new-b');
  insert into public.company_memberships (company_id, user_id, role) values ('${COMPANY_B}', '${USER_B}', 'owner');
  insert into public.customers (id, company_id, name, created_by) values ('${CUSTOMER_B}', '${COMPANY_B}', 'ZZZ ENT Customer B', '${USER_B}');
  insert into public.quotes (id, company_id, customer_id, quote_number, title, status, created_by, subtotal_cents, tax_cents, total_cents)
  values
    ('${QUOTE_B}', '${COMPANY_B}', '${CUSTOMER_B}', 'ZZZ-ENT-B', 'ZZZ ENT Quote B', 'accepted', '${USER_B}', 10000, 2100, 12100),
    ('${CORE_QUOTE_B}', '${COMPANY_B}', '${CUSTOMER_B}', 'ZZZ-ENT-CORE-B', 'ZZZ ENT Core Quote B', 'sent', '${USER_B}', 10000, 2100, 12100);
  insert into public.quote_items (quote_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents)
  values
    ('${QUOTE_A}', 1, 'ZZZ ENT product A', 1, 'stuk', 10000, 21, 10000),
    ('${QUOTE_B}', 1, 'ZZZ ENT product B', 1, 'stuk', 10000, 21, 10000),
    ('${CORE_QUOTE_B}', 1, 'ZZZ ENT Core product B', 1, 'stuk', 10000, 21, 10000);
  insert into public.company_module_entitlements (company_id, module_key, source) values ('${COMPANY_B}', 'planning', 'runtime_test');
`);

const environment = parseEnv(runNpx(["supabase", "status", "--output", "env"]));
assert.ok(environment.API_URL && environment.ANON_KEY && environment.JWT_SECRET, "Local Supabase API configuration is incomplete");

const eventPayloadA = {
  company_id: COMPANY_A,
  customer_id: CUSTOMER_A,
  quote_id: QUOTE_A,
  title: "ZZZ ENT preserved event A",
  event_type: "work",
  starts_at: "2030-01-01T09:00:00.000Z",
  source_type: "quote",
  created_by: USER_A,
};
const eventPayloadB = { ...eventPayloadA, company_id: COMPANY_B, customer_id: CUSTOMER_B, quote_id: QUOTE_B, created_by: USER_B, title: "ZZZ ENT event B" };

const aCreated = await dataApi(USER_A, "/planning_events", { method: "POST", body: JSON.stringify(eventPayloadA) });
assert.equal(aCreated.status, 201, "Entitled tenant A could not create Planning data");
const eventA = aCreated.body[0];
const bCreated = await dataApi(USER_B, "/planning_events", { method: "POST", body: JSON.stringify(eventPayloadB) });
assert.equal(bCreated.status, 201, "Temporarily entitled tenant B could not create its own Planning data");
const eventB = bCreated.body[0];

// Revocation denies B at the direct Data API boundary; no data or links are deleted.
sql(`update public.company_module_entitlements set is_enabled = false, revoked_at = now() where company_id = '${COMPANY_B}' and module_key = 'planning';`);
const bReadDenied = await dataApi(USER_B, `/planning_events?company_id=eq.${COMPANY_B}&select=id,title`);
assert.equal(bReadDenied.status, 200);
assert.deepEqual(bReadDenied.body, [], "Member B received Planning rows after revocation");
const bInsertDenied = await dataApi(USER_B, "/planning_events", { method: "POST", body: JSON.stringify({ ...eventPayloadB, title: "must not persist" }) });
assert.notEqual(bInsertDenied.status, 201, "Member B inserted Planning data after revocation");
const bUpdateDenied = await dataApi(USER_B, `/planning_events?id=eq.${eventB.id}`, { method: "PATCH", body: JSON.stringify({ title: "must not update" }) });
assert.ok(bUpdateDenied.status >= 400 || (Array.isArray(bUpdateDenied.body) && bUpdateDenied.body.length === 0), "Member B updated Planning data after revocation");
assert.equal(sql(`select title from public.planning_events where id = '${eventB.id}';`).trim(), "ZZZ ENT event B", "Revoked member changed an event");

for (const method of ["GET", "POST", "PATCH"]) {
  const path = method === "PATCH" ? `/company_module_entitlements?company_id=eq.${COMPANY_B}&module_key=eq.planning` : "/company_module_entitlements";
  const response = await dataApi(USER_B, path, method === "GET" ? {} : { method, body: JSON.stringify(method === "POST" ? { company_id: COMPANY_B, module_key: "planning", source: "forbidden" } : { is_enabled: true }) });
  assert.ok(response.status >= 400, `Authenticated client retained ${method} access to entitlement records`);
}
const catalogWriteDenied = await dataApi(USER_B, "/module_catalog", { method: "POST", body: JSON.stringify({ module_key: "forbidden" }) });
assert.ok(catalogWriteDenied.status >= 400, "Authenticated client retained module catalog write access");

// Tenant A revoke/re-grant proves preserved event/link data becomes visible again.
sql(`update public.company_module_entitlements set is_enabled = false, revoked_at = now() where company_id = '${COMPANY_A}' and module_key = 'planning';`);
const aReadDenied = await dataApi(USER_A, `/planning_events?id=eq.${eventA.id}&select=id,title,company_id,quote_id,customer_id`);
assert.equal(aReadDenied.status, 200);
assert.deepEqual(aReadDenied.body, [], "Revoked tenant A could still read Planning data");
assert.equal(sql(`select count(*) from public.planning_events where id = '${eventA.id}' and company_id = '${COMPANY_A}' and quote_id = '${QUOTE_A}' and customer_id = '${CUSTOMER_A}';`).trim(), "1", "Revocation deleted or unlinked Planning data");
sql(`update public.company_module_entitlements set is_enabled = true, revoked_at = null, granted_at = now() where company_id = '${COMPANY_A}' and module_key = 'planning';`);
const aReadRestored = await dataApi(USER_A, `/planning_events?id=eq.${eventA.id}&select=id,title,company_id,quote_id,customer_id`);
assert.equal(aReadRestored.status, 200);
assert.equal(aReadRestored.body.length, 1, "Re-grant did not restore the preserved Planning record");
assert.equal(aReadRestored.body[0].quote_id, QUOTE_A);

// A has no membership in B. Direct API must not create a cross-tenant event.
const crossTenant = await dataApi(USER_A, "/planning_events", { method: "POST", body: JSON.stringify(eventPayloadB) });
assert.notEqual(crossTenant.status, 201, "Tenant A created a Planning event in tenant B");

// Core quote acceptance remains independent from optional module entitlement.
const rawToken = "0".repeat(64);
sql(`update public.quotes set public_token_hash = public.hash_public_quote_token('${rawToken}'), public_token_expires_at = now() + interval '1 day', public_token_revoked_at = null where id = '${CORE_QUOTE_B}';`);
const anonymousDecision = await fetch(`${environment.API_URL}/rest/v1/rpc/customer_decide_quote`, {
  method: "POST",
  headers: { apikey: environment.ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ raw_token: rawToken, decision: "accepted", comment: null }),
});
assert.equal(anonymousDecision.status, 200, "Core quote acceptance request failed without Planning entitlement");
assert.equal(await anonymousDecision.json(), true, "Core quote acceptance did not succeed without Planning entitlement");
assert.equal(sql(`select status || ':' || subtotal_cents || ':' || tax_cents || ':' || total_cents from public.quotes where id = '${CORE_QUOTE_B}';`).trim(), "accepted:10000:2100:12100", "Core financial data changed during quote acceptance");
assert.equal(sql(`select count(*) from public.planning_events where quote_id = '${CORE_QUOTE_B}';`).trim(), "0", "Core quote acceptance created a Planning event");

assert.equal(sql(`select count(*) from public.audit_logs where action in ('module_entitlement.granted', 'module_entitlement.revoked');`).trim() === "0", false, "Entitlement audit records are missing");
console.log(JSON.stringify({
  result: "PASS",
  directDataApi: { revokedMemberSelect: "denied", revokedMemberInsert: "denied", revokedMemberUpdate: "denied" },
  revokePreservesData: true,
  coreWithoutPlanning: "accepted_without_planning_event",
}));
