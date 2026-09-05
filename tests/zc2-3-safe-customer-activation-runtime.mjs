/**
 * ZC2.3 local-only activation proof.
 *
 * This script resets the local Supabase stack by default, creates synthetic
 * companies, and exercises the service-role activation RPC through PostgREST.
 * It never targets a linked project and never prints credentials or tokens.
 * Use `node tests/zc2-3-safe-customer-activation-runtime.mjs`.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const USERS = {
  ownerA: "99999999-9999-4999-8999-999999999999",
  memberA: "99999999-9999-4999-8999-999999999998",
  ownerC: "99999999-9999-4999-8999-999999999997",
  ownerD: "99999999-9999-4999-8999-999999999996",
  ownerE: "99999999-9999-4999-8999-999999999995",
  ownerF: "99999999-9999-4999-8999-999999999994",
  ownerG: "99999999-9999-4999-8999-999999999993",
  ownerH: "99999999-9999-4999-8999-999999999992",
  ownerI: "99999999-9999-4999-8999-999999999991",
  ownerJ: "99999999-9999-4999-8999-999999999990",
};

const COMPANIES = {
  eligible: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  overCapacity: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  independent: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  suspended: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  parallel: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  invitations: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  suspensionRace: "11111111-1111-4111-8111-111111111111",
  separateH: "22222222-2222-4222-8222-222222222222",
  separateI: "33333333-3333-4333-8333-333333333333",
  failure: "44444444-4444-4444-8444-444444444444",
};

function run(command, args, input = undefined) {
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
  return run("docker", ["exec", "-i", databaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", statement]).trim();
}

function base64url(value) { return Buffer.from(value).toString("base64url"); }

function userJwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ aud: "authenticated", role: "authenticated", sub: userId, iat: now, exp: now + 300 }));
  const signature = createHmac("sha256", environment.JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function rpc(functionName, body, { userId, service = false } = {}) {
  const key = service ? environment.SERVICE_ROLE_KEY : environment.ANON_KEY;
  const response = await fetch(`${environment.API_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${service ? key : userJwt(userId)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* assertions use status for error paths */ }
  return { status: response.status, body: parsed };
}

async function tableRequest(userId, path, method, body) {
  const response = await fetch(`${environment.API_URL}/rest/v1${path}`, {
    method,
    headers: { apikey: environment.ANON_KEY, Authorization: `Bearer ${userJwt(userId)}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

function createUserSql(userId, suffix) {
  return `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('${userId}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zc23-${suffix}@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()); insert into public.users (id, email, full_name) values ('${userId}', 'zc23-${suffix}@example.test', 'ZC23 ${suffix}');`;
}

function createCompanySql(companyId, slug, userId, extraMemberships = "") {
  return `insert into public.companies (id, name, slug) values ('${companyId}', 'ZC23 ${slug}', 'zc23-${slug}'); select set_config('app.zc1_8b_membership_write','on',true); insert into public.company_memberships (company_id, user_id, role) values ('${companyId}', '${userId}', 'owner')${extraMemberships};`;
}

const databaseContainer = run("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).trim().split(/\r?\n/)[0];
assert.ok(databaseContainer, "Local Supabase database container is required");
if (!process.argv.includes("--no-reset")) runNpx(["supabase", "db", "reset", "--local", "--yes", "--no-seed"]);
const environment = parseEnv(runNpx(["supabase", "status", "--output", "env"]));
assert.ok(environment.API_URL && environment.ANON_KEY && environment.SERVICE_ROLE_KEY && environment.JWT_SECRET, "Local Supabase configuration is incomplete");

sql(Object.values(USERS).map((id, index) => createUserSql(id, `user-${index}`)).join("\n"));
sql([
  createCompanySql(COMPANIES.eligible, "eligible", USERS.ownerA),
  createCompanySql(COMPANIES.overCapacity, "over-capacity", USERS.ownerC, `, ('${COMPANIES.overCapacity}', '${USERS.ownerD}', 'employee'), ('${COMPANIES.overCapacity}', '${USERS.ownerE}', 'employee'), ('${COMPANIES.overCapacity}', '${USERS.ownerF}', 'technician')`),
  createCompanySql(COMPANIES.independent, "independent", USERS.ownerC),
  createCompanySql(COMPANIES.suspended, "suspended", USERS.ownerD),
  createCompanySql(COMPANIES.parallel, "parallel", USERS.ownerE),
  createCompanySql(COMPANIES.invitations, "invitations", USERS.ownerF),
  createCompanySql(COMPANIES.suspensionRace, "suspension-race", USERS.ownerG),
  createCompanySql(COMPANIES.separateH, "separate-h", USERS.ownerH),
  createCompanySql(COMPANIES.separateI, "separate-i", USERS.ownerI),
  createCompanySql(COMPANIES.failure, "failure", USERS.ownerJ),
  `insert into public.company_memberships (company_id, user_id, role) values ('${COMPANIES.eligible}', '${USERS.memberA}', 'employee');`,
].join("\n"));

// Pre-existing independent grants and a suspension must survive activation.
sql(`
insert into public.entitlement_grants (company_id,module_key,source,reason,reference_kind,reference_key,actor_kind,actor_user_id,actor_principal)
values
  ('${COMPANIES.independent}','planning','manual','local manual grant','runtime_test','manual-preserved','user','${USERS.ownerC}',null),
  ('${COMPANIES.independent}','planning','migration_legacy','local legacy grant','legacy_row','legacy-preserved','system',null,'local_runtime');
insert into public.entitlement_grants (company_id,module_key,source,reason,reference_kind,reference_key,actor_kind,actor_principal,valid_from,valid_until)
values ('${COMPANIES.independent}','planning','internal','future unrelated grant','runtime_test','future-unrelated','system','local_runtime',now()+interval '1 day',now()+interval '2 days');
insert into public.entitlement_suspensions (company_id,module_key,reason,reference_kind,reference_key,actor_kind,actor_principal)
values ('${COMPANIES.suspended}','planning','local suspension','runtime_test','suspension-preserved','system','local_runtime'),
       ('${COMPANIES.suspensionRace}','planning','race suspension','runtime_test','suspension-race','system','local_runtime');
`);

const activation = await rpc("activate_early_access_company", { target_company_id: COMPANIES.eligible }, { service: true });
assert.equal(activation.status, 200, "Eligible activation failed");
assert.equal(activation.body.status, "activated");
for (const [key, expected] of [["plan_code", "early_access"], ["base_price_cents", 4900], ["currency", "EUR"], ["billing_interval", "monthly"], ["included_seats", 3], ["extra_seat_price_cents", 900], ["planning", "commercial"], ["field_service", "MODULE_NOT_RELEASED"], ["ai_customer_service", "MODULE_NOT_RELEASED"]]) assert.equal(activation.body[key], expected, `${key} snapshot mismatch`);
assert.equal(sql(`select (intro_price_until = current_period_start + interval '12 months')::text from public.subscriptions where id='${activation.body.subscription_id}';`), "true", "Intro period is not activation + 12 months");
assert.equal(sql(`select count(*) from public.subscriptions where company_id='${COMPANIES.eligible}' and is_primary and status='active';`), "1");
assert.equal(sql(`select count(*) from public.subscription_items where subscription_id='${activation.body.subscription_id}';`), "0", "Base plan was incorrectly duplicated as an item");
assert.equal(sql(`select count(*) from public.subscriptions where company_id='${COMPANIES.eligible}' and (stripe_customer_id is not null or stripe_subscription_id is not null or stripe_price_id is not null);`), "0", "Provider references were populated");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.eligible}' and source='commercial' and module_key='planning';`), "1");

const retry = await rpc("activate_early_access_company", { target_company_id: COMPANIES.eligible }, { service: true });
assert.equal(retry.status, 200);
assert.equal(retry.body.status, "already_active");
assert.equal(sql(`select count(*) from public.subscriptions where company_id='${COMPANIES.eligible}';`), "1");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.eligible}' and source='commercial';`), "1");
assert.equal(sql(`select count(*) from public.audit_logs where company_id='${COMPANIES.eligible}' and action like 'commercial.%';`), "4", "Idempotent retry duplicated activation audit");

const browserActivation = await rpc("activate_early_access_company", { target_company_id: COMPANIES.eligible }, { userId: USERS.ownerA });
assert.ok(browserActivation.status >= 400, "Authenticated owner could self-activate");
for (const method of ["POST", "PATCH", "DELETE"]) {
  const response = await tableRequest(USERS.ownerA, "/subscriptions", method, { company_id: COMPANIES.eligible, status: "active" });
  assert.ok(response.status >= 400, `Browser retained ${method} access to subscriptions`);
  const grantResponse = await tableRequest(USERS.ownerA, "/entitlement_grants", method, { company_id: COMPANIES.eligible, module_key: "planning", source: "commercial" });
  assert.ok(grantResponse.status >= 400, `Browser retained ${method} access to commercial grants`);
}
const memberActivation = await rpc("activate_early_access_company", { target_company_id: COMPANIES.eligible }, { userId: USERS.memberA });
assert.ok(memberActivation.status >= 400, "Normal member could self-activate");

// Effective module state: Core implicit, Planning available, planned modules denied.
const access = (companyId, userId, moduleKey) => sql(`select set_config('request.jwt.claim.sub','${userId}',true); select set_config('request.jwt.claim.role','authenticated',true); select code from public.resolve_effective_module_access('${companyId}','${moduleKey}');`).split(/\r?\n/).pop();
assert.equal(access(COMPANIES.eligible, USERS.ownerA, "core"), "MODULE_AVAILABLE");
assert.equal(access(COMPANIES.eligible, USERS.ownerA, "planning"), "MODULE_AVAILABLE");
assert.equal(access(COMPANIES.eligible, USERS.ownerA, "field_service"), "MODULE_NOT_RELEASED");
assert.equal(access(COMPANIES.eligible, USERS.ownerA, "ai_customer_service"), "MODULE_NOT_RELEASED");

// Existing grants remain independent; suspension wins over the commercial grant.
const independentActivation = await rpc("activate_early_access_company", { target_company_id: COMPANIES.independent }, { service: true });
assert.equal(independentActivation.status, 200);
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.independent}' and source='manual' and reference_key='manual-preserved';`), "1");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.independent}' and source='migration_legacy' and reference_key='legacy-preserved';`), "1");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.independent}' and reference_key='future-unrelated';`), "1");
const suspendedActivation = await rpc("activate_early_access_company", { target_company_id: COMPANIES.suspended }, { service: true });
assert.equal(suspendedActivation.status, 200);
assert.equal(access(COMPANIES.suspended, USERS.ownerD, "planning"), "MODULE_SUSPENDED");

// Capacity is fail-closed before activation and never fabricates extra seats.
const overCapacity = await rpc("activate_early_access_company", { target_company_id: COMPANIES.overCapacity }, { service: true });
assert.equal(overCapacity.status, 400, "Over-capacity activation did not fail closed");
assert.equal(sql(`select count(*) from public.subscriptions where company_id='${COMPANIES.overCapacity}';`), "0");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.overCapacity}' and source='commercial';`), "0");
assert.equal(sql(`select count(*) from public.audit_logs where company_id='${COMPANIES.overCapacity}' and action like 'commercial.%';`), "0");

// Real parallel HTTP requests: one activation per company and one logical result.
const parallelResults = await Promise.all(Array.from({ length: 20 }, () => rpc("activate_early_access_company", { target_company_id: COMPANIES.parallel }, { service: true })));
assert.equal(parallelResults.filter((result) => result.status === 200 && result.body.status === "activated").length, 1);
assert.equal(parallelResults.filter((result) => result.status === 200 && result.body.status === "already_active").length, 19);
assert.equal(sql(`select count(*) from public.subscriptions where company_id='${COMPANIES.parallel}' and is_primary and status='active';`), "1");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.parallel}' and source='commercial';`), "1");
assert.equal(sql(`select count(*) from public.audit_logs where company_id='${COMPANIES.parallel}' and action like 'commercial.%';`), "4");

// Activation versus five seat-consuming invitation calls: usage never exceeds three.
const inviteRace = await Promise.all([
  rpc("activate_early_access_company", { target_company_id: COMPANIES.invitations }, { service: true }),
  ...Array.from({ length: 5 }, (_, index) => rpc("create_company_invitation", { target_company_id: COMPANIES.invitations, target_email: `zc23-invite-${index}@example.test`, target_role: "employee" }, { userId: USERS.ownerF })),
]);
assert.ok(inviteRace.some((result) => result.status === 200), "Activation/invitation race produced no successful operation");
assert.ok(Number(sql(`select public.company_seat_usage('${COMPANIES.invitations}');`)) <= 3, "Seat usage exceeded resulting capacity");
assert.ok(inviteRace.filter((result) => result.status === 200 && result.body?.token).length <= 2, "Invitation race exceeded two available seats");

// Activation versus suspension: the company-scoped advisory lock preserves suspension precedence.
const suspensionRace = await Promise.all([
  rpc("activate_early_access_company", { target_company_id: COMPANIES.suspensionRace }, { service: true }),
  rpc("create_entitlement_suspension", { target_company_id: COMPANIES.suspensionRace, target_module_key: "planning", target_reason: "race suspension", target_reference_kind: "runtime_test", target_reference_key: "suspension-race-second", target_actor_user_id: USERS.ownerG }, { service: true }),
]);
assert.ok(suspensionRace.every((result) => result.status === 200), "Activation/suspension race failed");
assert.equal(access(COMPANIES.suspensionRace, USERS.ownerG, "planning"), "MODULE_SUSPENDED");

const separate = await Promise.all([
  rpc("activate_early_access_company", { target_company_id: COMPANIES.separateH }, { service: true }),
  rpc("activate_early_access_company", { target_company_id: COMPANIES.separateI }, { service: true }),
]);
assert.ok(separate.every((result) => result.status === 200), "Independent companies blocked each other");

// The over-capacity company above is the deliberate rollback proof: the
// transaction fails before the subscription/grant/audit transition exists.
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.overCapacity}' and source='commercial';`), "0");

const secretAudit = sql(`select count(*) from public.audit_logs where company_id in ('${Object.values(COMPANIES).join("','")}') and lower(metadata::text) ~ '(password|jwt|access_token|refresh_token|stripe_secret|api_key)';`);
assert.equal(secretAudit, "0", "Activation audit metadata contains a secret-like field");

const revoked = await rpc("revoke_early_access_commercial_grant", { target_grant_id: activation.body.grant_id }, { service: true });
assert.equal(revoked.status, 200);
assert.equal(sql(`select status from public.entitlement_grants where id='${activation.body.grant_id}';`), "revoked");
assert.equal(sql(`select count(*) from public.entitlement_grants where company_id='${COMPANIES.eligible}' and source='commercial' and status='revoked';`), "1");

console.log(JSON.stringify({
  result: "PASS",
  activation: "exact provider-neutral snapshot",
  idempotency: "one subscription, one commercial grant, four commercial transition audits",
  concurrency: { C1: "PASS", C2: "PASS", C3: "PASS", C4: "PASS", C5: "PASS" },
  moduleAccess: { core: "available", planning: "available before revoke", field_service: "MODULE_NOT_RELEASED", ai_customer_service: "MODULE_NOT_RELEASED", suspension: "MODULE_SUSPENDED" },
  browserWrites: "denied",
  auditSecrets: "none",
}));
