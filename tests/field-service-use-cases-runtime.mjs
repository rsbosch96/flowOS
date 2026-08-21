import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_A = "11111111-1111-4111-8111-111111111112";
const TECH_A = "11111111-1111-4111-8111-111111111113";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A = "aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE_A = "aaaaaaaa-aaa2-4aaa-8aaa-aaaaaaaaaaaa";
const QUOTE_B = "bbbbbbbb-bbb2-4bbb-8bbb-bbbbbbbbbbbb";

function run(command, args, input) {
  return execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}
function runNpx(args) {
  if (process.platform !== "win32") return run("npx", args);
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npx ${args.join(" ")}`]);
}
function parseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(?:export )?([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
}
function sql(statement) {
  return run("docker", ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", statement]);
}
function base64url(value) { return Buffer.from(value).toString("base64url"); }
function userJwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ aud: "authenticated", role: "authenticated", sub: userId, iat: now, exp: now + 300 }));
  return `${header}.${payload}.${createHmac("sha256", environment.JWT_SECRET).update(`${header}.${payload}`).digest("base64url")}`;
}
async function dataApi(userId, path, init = {}) {
  const response = await fetch(`${environment.API_URL}/rest/v1${path}`, {
    ...init,
    headers: { apikey: environment.ANON_KEY, Authorization: `Bearer ${userJwt(userId)}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* status assertions are sufficient */ }
  return { status: response.status, body };
}
function rpc(userId, name, payload) { return dataApi(userId, `/rpc/${name}`, { method: "POST", body: JSON.stringify(payload) }); }
function assertDenied(response, message) { assert.ok(response.status >= 400, message); }

const databaseContainer = run("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).trim().split(/\r?\n/)[0];
assert.ok(databaseContainer, "A local Supabase database container is required");
let environment;

async function main() {
  runNpx(["supabase", "db", "reset", "--local", "--no-seed"]);
  environment = parseEnv(runNpx(["supabase", "status", "--output", "env"]));
  assert.ok(environment.API_URL && environment.ANON_KEY && environment.JWT_SECRET, "Local Supabase API configuration is incomplete");

  sql(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('${OWNER_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs12-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${EMPLOYEE_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs12-employee-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${TECH_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs12-tech-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${OWNER_B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs12-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    insert into public.users (id, email, full_name) values
      ('${OWNER_A}', 'fs12-owner-a@example.test', 'FS1.2 Owner A'),
      ('${EMPLOYEE_A}', 'fs12-employee-a@example.test', 'FS1.2 Employee A'),
      ('${TECH_A}', 'fs12-tech-a@example.test', 'FS1.2 Technician A'),
      ('${OWNER_B}', 'fs12-owner-b@example.test', 'FS1.2 Owner B');
    insert into public.companies (id, name, slug) values
      ('${COMPANY_A}', 'FS1.2 Tenant A', 'fs12-a'),
      ('${COMPANY_B}', 'FS1.2 Tenant B', 'fs12-b');
    insert into public.company_memberships (company_id, user_id, role) values
      ('${COMPANY_A}', '${OWNER_A}', 'owner'),
      ('${COMPANY_A}', '${EMPLOYEE_A}', 'employee'),
      ('${COMPANY_A}', '${TECH_A}', 'technician'),
      ('${COMPANY_B}', '${OWNER_B}', 'owner');
    insert into public.customers (id, company_id, name, created_by) values
      ('${CUSTOMER_A}', '${COMPANY_A}', 'FS1.2 Customer A', '${OWNER_A}'),
      ('${CUSTOMER_B}', '${COMPANY_B}', 'FS1.2 Customer B', '${OWNER_B}');
    insert into public.quotes (id, company_id, customer_id, quote_number, title, status, created_by, subtotal_cents, tax_cents, total_cents)
    values
      ('${QUOTE_A}', '${COMPANY_A}', '${CUSTOMER_A}', 'FS12-A', 'FS1.2 Quote A', 'accepted', '${OWNER_A}', 10000, 2100, 12100),
      ('${QUOTE_B}', '${COMPANY_B}', '${CUSTOMER_B}', 'FS12-B', 'FS1.2 Quote B', 'accepted', '${OWNER_B}', 10000, 2100, 12100);
    update public.module_catalog set release_state = 'released' where module_key = 'field_service';
    insert into public.company_module_entitlements (company_id, module_key, source)
    values ('${COMPANY_A}', 'field_service', 'fs1_2_local_runtime'), ('${COMPANY_B}', 'field_service', 'fs1_2_local_runtime');
  `);

  const base = { target_company_id: COMPANY_A, target_customer_id: CUSTOMER_A, target_title: "FS1.2 operation proof" };
  const created = await rpc(OWNER_A, "create_field_service_work_order", base);
  assert.equal(created.status, 200, `Owner create failed: ${JSON.stringify(created.body)}`);
  const workOrder = created.body;
  assert.equal(workOrder.status, "planned");

  for (const payload of [
    { ...base, target_customer_id: CUSTOMER_B },
    { ...base, target_quote_id: QUOTE_B },
    { ...base, target_assigned_user_id: OWNER_B },
  ]) assertDenied(await rpc(OWNER_A, "create_field_service_work_order", payload), "Cross-tenant create was accepted");
  assertDenied(await rpc(TECH_A, "create_field_service_work_order", base), "Technician created a tenant-wide work order");

  assertDenied(await dataApi(OWNER_A, "/field_service_work_orders", { method: "POST", body: JSON.stringify({ company_id: COMPANY_A, customer_id: CUSTOMER_A, title: "direct insert" }) }), "Direct Data API insert remained available");
  assertDenied(await dataApi(OWNER_A, `/field_service_work_orders?id=eq.${workOrder.id}`, { method: "PATCH", body: JSON.stringify({ title: "direct update" }) }), "Direct Data API update remained available");
  assertDenied(await dataApi(OWNER_A, `/field_service_work_orders?id=eq.${workOrder.id}`, { method: "DELETE" }), "Direct Data API delete remained available");

  const tenantBOrder = await rpc(OWNER_B, "create_field_service_work_order", { target_company_id: COMPANY_B, target_customer_id: CUSTOMER_B, target_title: "FS1.2 Tenant B" });
  assert.equal(tenantBOrder.status, 200);
  assertDenied(await rpc(OWNER_A, "dispatch_field_service_work_order", { target_company_id: COMPANY_B, target_work_order_id: tenantBOrder.body.id }), "Tenant A dispatched tenant B work order");
  const crossRead = await dataApi(OWNER_A, `/field_service_work_orders?company_id=eq.${COMPANY_B}&select=id`);
  assert.ok(crossRead.status >= 400 || (Array.isArray(crossRead.body) && crossRead.body.length === 0), "Tenant A read tenant B work order");

  assertDenied(await rpc(OWNER_A, "dispatch_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id }), "Unassigned work order was dispatched");
  const assigned = await rpc(OWNER_A, "assign_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_assigned_user_id: TECH_A });
  assert.equal(assigned.status, 200);
  const sameAssignment = await rpc(OWNER_A, "assign_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_assigned_user_id: TECH_A });
  assert.equal(sameAssignment.status, 200, "Same-assignee intent was not idempotent");
  assertDenied(await rpc(OWNER_A, "assign_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_assigned_user_id: OWNER_B }), "Cross-tenant assignee was accepted");

  assert.equal((await rpc(OWNER_A, "dispatch_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id })).status, 200);
  const competingStarts = await Promise.all([
    rpc(TECH_A, "start_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id }),
    rpc(TECH_A, "start_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id }),
  ]);
  assert.ok(competingStarts.every((response) => response.status === 200), "Concurrent idempotent starts diverged");
  assert.ok(competingStarts[0].body.started_at && competingStarts[1].body.started_at, "Start timestamp missing");
  assert.equal((await rpc(TECH_A, "complete_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id })).status, 200);
  const completedAgain = await rpc(TECH_A, "complete_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id });
  assert.equal(completedAgain.status, 200, "Repeated completion was not idempotent");
  assertDenied(await rpc(OWNER_A, "cancel_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id }), "Completed work order was cancelled");

  const cancelled = await rpc(OWNER_A, "create_field_service_work_order", { ...base, target_title: "FS1.2 cancellation" });
  assert.equal(cancelled.status, 200);
  assert.equal((await rpc(OWNER_A, "cancel_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: cancelled.body.id })).status, 200);
  assert.equal((await rpc(OWNER_A, "cancel_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: cancelled.body.id })).status, 200, "Repeated cancellation was not idempotent");

  const invalid = await rpc(OWNER_A, "create_field_service_work_order", { ...base, target_title: "FS1.2 invalid transition" });
  assert.equal(invalid.status, 200);
  assertDenied(await rpc(OWNER_A, "complete_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: invalid.body.id }), "planned -> completed was accepted");
  assertDenied(await rpc(TECH_A, "cancel_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: invalid.body.id }), "Technician cancelled a work order");

  sql(`update public.company_module_entitlements set is_enabled = false, revoked_at = now() where company_id = '${COMPANY_A}' and module_key = 'field_service';`);
  assertDenied(await rpc(OWNER_A, "create_field_service_work_order", base), "Module-unavailable create was accepted");
  assertDenied(await rpc(OWNER_A, "dispatch_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: workOrder.id }), "Module-unavailable transition was accepted");
  sql(`update public.company_module_entitlements set is_enabled = true, revoked_at = null where company_id = '${COMPANY_A}' and module_key = 'field_service';`);

  const auditCounts = sql(`select action, count(*) from public.audit_logs where company_id = '${COMPANY_A}' and entity_type = 'field_service_work_order' group by action order by action;`).trim();
  assert.match(auditCounts, /field_service\.assigned\|1/);
  assert.match(auditCounts, /field_service\.completed\|1/);
  assert.match(auditCounts, /field_service\.cancelled\|1/);
  assert.equal(sql(`select count(*) from public.quotes where id = '${QUOTE_A}' and subtotal_cents = 10000 and tax_cents = 2100 and total_cents = 12100;`).trim(), "1");
  assert.equal(sql(`select count(*) from public.invoices where subtotal_cents = 12100 and tax_cents = 2541 and total_cents = 14641;`).trim(), "0");
  console.log("FS1.2 local runtime proof: PASS");
}

try {
  await main();
} finally {
  try { runNpx(["supabase", "db", "reset", "--local", "--no-seed"]); } catch { /* preserve original failure */ }
}
