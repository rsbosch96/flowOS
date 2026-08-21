/**
 * FS1.1 local-only runtime proof.
 *
 * This test deliberately uses only the local Supabase stack. It never uses a
 * linked project, remote URL, or service credentials, and resets the local
 * database before and after the proof so no synthetic fixtures remain.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const USER_TECH = "33333333-3333-4333-8333-333333333333";
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
    if (!match) return [];
    return [[match[1], match[2].replace(/^['"]|['"]$/g, "")]];
  }));
}

function sql(statement) {
  return run("docker", ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", statement]);
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
  try { body = text ? JSON.parse(text) : null; } catch { /* assertions use status only */ }
  return { status: response.status, body };
}

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
      ('${USER_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fs-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${USER_B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fs-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${USER_TECH}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zzz-fs-tech@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    insert into public.users (id, email, full_name) values
      ('${USER_A}', 'zzz-fs-a@example.test', 'ZZZ FS User A'),
      ('${USER_B}', 'zzz-fs-b@example.test', 'ZZZ FS User B'),
      ('${USER_TECH}', 'zzz-fs-tech@example.test', 'ZZZ FS Technician');
    insert into public.companies (id, name, slug) values
      ('${COMPANY_A}', 'ZZZ FS Tenant A', 'zzz-fs-a'),
      ('${COMPANY_B}', 'ZZZ FS Tenant B', 'zzz-fs-b');
    insert into public.company_memberships (company_id, user_id, role) values
      ('${COMPANY_A}', '${USER_A}', 'owner'),
      ('${COMPANY_A}', '${USER_TECH}', 'technician'),
      ('${COMPANY_B}', '${USER_B}', 'owner');
    insert into public.customers (id, company_id, name, created_by) values
      ('${CUSTOMER_A}', '${COMPANY_A}', 'ZZZ FS Customer A', '${USER_A}'),
      ('${CUSTOMER_B}', '${COMPANY_B}', 'ZZZ FS Customer B', '${USER_B}');
    insert into public.quotes (id, company_id, customer_id, quote_number, title, status, created_by, subtotal_cents, tax_cents, total_cents)
    values
      ('${QUOTE_A}', '${COMPANY_A}', '${CUSTOMER_A}', 'ZZZ-FS-A', 'ZZZ FS Quote A', 'accepted', '${USER_A}', 10000, 2100, 12100),
      ('${QUOTE_B}', '${COMPANY_B}', '${CUSTOMER_B}', 'ZZZ-FS-B', 'ZZZ FS Quote B', 'accepted', '${USER_B}', 10000, 2100, 12100);
    insert into public.company_module_entitlements (company_id, module_key, source)
    values
      ('${COMPANY_A}', 'planning', 'runtime_test'),
      ('${COMPANY_B}', 'planning', 'runtime_test'),
      ('${COMPANY_A}', 'field_service', 'runtime_test'),
      ('${COMPANY_B}', 'field_service', 'runtime_test');
  `);

  const planningEventAResponse = await dataApi(USER_A, "/planning_events", {
    method: "POST",
    body: JSON.stringify({
      company_id: COMPANY_A,
      customer_id: CUSTOMER_A,
      quote_id: QUOTE_A,
      title: "ZZZ FS planning A",
      event_type: "work",
      starts_at: "2030-01-01T09:00:00.000Z",
      source_type: "quote",
      created_by: USER_A,
    }),
  });
  assert.equal(planningEventAResponse.status, 201, `Planning event A could not be created: ${JSON.stringify(planningEventAResponse.body)}`);
  const planningEventA = planningEventAResponse.body[0];
  const planningEventBResponse = await dataApi(USER_B, "/planning_events", {
    method: "POST",
    body: JSON.stringify({
      company_id: COMPANY_B,
      customer_id: CUSTOMER_B,
      quote_id: QUOTE_B,
      title: "ZZZ FS planning B",
      event_type: "work",
      starts_at: "2030-01-01T10:00:00.000Z",
      source_type: "quote",
      created_by: USER_B,
    }),
  });
  assert.equal(planningEventBResponse.status, 201, `Planning event B could not be created: ${JSON.stringify(planningEventBResponse.body)}`);
  const planningEventB = planningEventBResponse.body[0];

  const access = async (userId, companyId, moduleKey) => dataApi(userId, "/rpc/resolve_company_module_access", {
    method: "POST",
    body: JSON.stringify({ target_company_id: companyId, target_module_key: moduleKey }),
  });
  assert.equal((await access(USER_A, COMPANY_A, "field_service")).body, "MODULE_NOT_RELEASED");
  sql("update public.module_catalog set release_state = 'released' where module_key = 'field_service';");
  sql(`update public.company_module_entitlements set is_enabled = false, revoked_at = now() where module_key = 'field_service' and company_id = '${COMPANY_A}';`);
  assert.equal((await access(USER_A, COMPANY_A, "field_service")).body, "MODULE_NOT_ENTITLED");
  sql(`update public.company_module_entitlements set is_enabled = true, revoked_at = null where module_key = 'field_service' and company_id = '${COMPANY_A}';`);
  assert.equal((await access(USER_A, COMPANY_A, "field_service")).body, "MODULE_AVAILABLE");
  assert.equal((await access(USER_A, COMPANY_A, "core")).body, "MODULE_AVAILABLE", "Core must remain independent");
  assert.equal((await access(USER_A, COMPANY_A, "planning")).body, "MODULE_AVAILABLE", "Planning must remain independent");

  const create = (userId, payload) => dataApi(userId, "/rpc/create_field_service_work_order", { method: "POST", body: JSON.stringify(payload) });
  const transition = (userId, payload) => dataApi(userId, "/rpc/transition_field_service_work_order", { method: "POST", body: JSON.stringify(payload) });
  const base = { target_company_id: COMPANY_A, target_customer_id: CUSTOMER_A, target_title: "ZZZ FS local work order" };
  const linked = await create(USER_A, { ...base, target_quote_id: QUOTE_A, target_planning_event_id: planningEventA.id });
  assert.equal(linked.status, 200, `Valid Core links were rejected: ${JSON.stringify(linked.body)}`);
  assert.equal(linked.body.quote_id, QUOTE_A);
  assert.equal(linked.body.planning_event_id, planningEventA.id);
  const created = await create(USER_A, base);
  assert.equal(created.status, 200, `Owner could not create work order: ${JSON.stringify(created.body)}`);
  const workOrder = created.body;
  assert.equal(workOrder.company_id, COMPANY_A);
  assert.equal(workOrder.customer_id, CUSTOMER_A);
  assert.equal(workOrder.planning_event_id, null);

  for (const payload of [
    { ...base, target_customer_id: CUSTOMER_B },
    { ...base, target_quote_id: QUOTE_B },
    { ...base, target_planning_event_id: planningEventB.id },
    { ...base, target_assigned_user_id: USER_B },
  ]) {
    const response = await create(USER_A, payload);
    assert.ok(response.status >= 400, "Cross-tenant related ID was accepted");
  }

  const directInsert = await dataApi(USER_A, "/field_service_work_orders", { method: "POST", body: JSON.stringify({ company_id: COMPANY_A, customer_id: CUSTOMER_A, title: "direct write" }) });
  assert.ok(directInsert.status >= 400, "Direct Data API insert remained available");
  const directUpdate = await dataApi(USER_A, `/field_service_work_orders?id=eq.${workOrder.id}`, { method: "PATCH", body: JSON.stringify({ title: "direct update" }) });
  assert.ok(directUpdate.status >= 400, "Direct Data API update remained available");
  const tenantBOrder = await create(USER_B, { target_company_id: COMPANY_B, target_customer_id: CUSTOMER_B, target_title: "ZZZ FS tenant B work order" });
  assert.equal(tenantBOrder.status, 200);
  const crossRead = await dataApi(USER_A, `/field_service_work_orders?company_id=eq.${COMPANY_B}&select=id`);
  assert.ok(crossRead.status >= 400 || (Array.isArray(crossRead.body) && crossRead.body.length === 0), "Tenant A read tenant B work orders");
  const crossTransition = await transition(USER_A, { target_company_id: COMPANY_B, target_work_order_id: workOrder.id, target_status: "dispatched" });
  assert.ok(crossTransition.status >= 400, "Tenant A transitioned a work order outside its tenant");
  const crossTransitionExisting = await transition(USER_A, { target_company_id: COMPANY_B, target_work_order_id: tenantBOrder.body.id, target_status: "dispatched" });
  assert.ok(crossTransitionExisting.status >= 400, "Tenant A transitioned an existing tenant B work order");

  const dispatched = await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_status: "dispatched" });
  assert.equal(dispatched.status, 200);
  const started = await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_status: "in_progress" });
  assert.equal(started.status, 200);
  assert.ok(started.body.started_at, "Starting a work order did not set started_at");
  const completed = await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_status: "completed" });
  assert.equal(completed.status, 200);
  assert.ok(completed.body.completed_at, "Completing a work order did not set completed_at");
  const terminalRetry = await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_status: "completed" });
  assert.equal(terminalRetry.status, 200, "Repeated transition was not deterministic");
  for (const status of ["in_progress", "cancelled"]) {
    const response = await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_status: status });
    assert.ok(response.status >= 400, "Terminal work order accepted a further transition");
  }
  for (const status of ["completed", "in_progress"]) {
    const fresh = await create(USER_A, { ...base, target_title: `ZZZ FS invalid planned ${status}` });
    assert.equal(fresh.status, 200);
    const response = await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: fresh.body.id, target_status: status });
    assert.ok(response.status >= 400, `planned -> ${status} was accepted`);
  }
  const dispatchedInvalid = await create(USER_A, { ...base, target_title: "ZZZ FS invalid dispatched" });
  assert.equal(dispatchedInvalid.status, 200);
  assert.equal((await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: dispatchedInvalid.body.id, target_status: "dispatched" })).status, 200);
  assert.ok((await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: dispatchedInvalid.body.id, target_status: "completed" })).status >= 400, "dispatched -> completed was accepted");
  const inProgressInvalid = await create(USER_A, { ...base, target_title: "ZZZ FS invalid in progress" });
  assert.equal(inProgressInvalid.status, 200);
  assert.equal((await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: inProgressInvalid.body.id, target_status: "dispatched" })).status, 200);
  assert.equal((await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: inProgressInvalid.body.id, target_status: "in_progress" })).status, 200);
  assert.ok((await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: inProgressInvalid.body.id, target_status: "planned" })).status >= 400, "in_progress -> planned was accepted");

  const cancelled = await create(USER_B, { ...base, target_company_id: COMPANY_B, target_customer_id: CUSTOMER_B, target_title: "ZZZ FS cancelled work order" });
  assert.equal(cancelled.status, 200);
  const cancelledResult = await transition(USER_B, { target_company_id: COMPANY_B, target_work_order_id: cancelled.body.id, target_status: "cancelled" });
  assert.equal(cancelledResult.status, 200);
  assert.ok(cancelledResult.body.cancelled_at);
  const cancelledRetry = await transition(USER_B, { target_company_id: COMPANY_B, target_work_order_id: cancelled.body.id, target_status: "planned" });
  assert.ok(cancelledRetry.status >= 400);

  const technicianOrder = await create(USER_A, { ...base, target_title: "ZZZ FS technician work order", target_assigned_user_id: USER_TECH });
  assert.equal(technicianOrder.status, 200);
  assert.equal((await transition(USER_A, { target_company_id: COMPANY_A, target_work_order_id: technicianOrder.body.id, target_status: "dispatched" })).status, 200);
  const technicianStarted = await transition(USER_TECH, { target_company_id: COMPANY_A, target_work_order_id: technicianOrder.body.id, target_status: "in_progress" });
  assert.equal(technicianStarted.status, 200, `Technician could not start assigned work order: ${JSON.stringify(technicianStarted.body)}`);
  assert.ok((await transition(USER_TECH, { target_company_id: COMPANY_A, target_work_order_id: workOrder.id, target_status: "cancelled" })).status >= 400);

  sql(`update public.company_module_entitlements set is_enabled = false, revoked_at = now() where company_id = '${COMPANY_A}' and module_key = 'planning';`);
  assert.equal(sql(`select count(*) from public.field_service_work_orders where id = '${linked.body.id}' and planning_event_id = '${planningEventA.id}' and quote_id = '${QUOTE_A}';`).trim(), "1", "Planning revocation affected work-order data");
  sql(`update public.company_module_entitlements set is_enabled = true, revoked_at = null where company_id = '${COMPANY_A}' and module_key = 'planning';`);

  const auditCount = sql(`select count(*) from public.audit_logs where company_id in ('${COMPANY_A}', '${COMPANY_B}') and action like 'field_service.%';`).trim();
  assert.ok(Number(auditCount) >= 6, "Expected Field Service lifecycle audit events were not written");
  console.log("FS1.1 local runtime proof: PASS");
}

try {
  await main();
} finally {
  try { runNpx(["supabase", "db", "reset", "--local", "--no-seed"]); } catch { /* preserve the original assertion/error */ }
}
