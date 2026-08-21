import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const TECH_A = "11111111-1111-4111-8111-111111111113";
const TECH_B = "11111111-1111-4111-8111-111111111114";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_A = "aaaaaaaa-aaa1-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbb1-4bbb-8bbb-bbbbbbbbbbbb";
const PRODUCT_A = "aaaaaaaa-aaa3-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_B = "bbbbbbbb-bbb3-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE_A = "aaaaaaaa-aaa2-4aaa-8aaa-aaaaaaaaaaaa";

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
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, body };
}
async function rpc(userId, name, payload) {
  return dataApi(userId, `/rpc/${name}`, { method: "POST", body: JSON.stringify(payload) });
}
function assertDenied(response, message) { assert.ok(response.status >= 400, `${message}: ${response.status}`); }
function storageUrl(path) {
  return `${environment.API_URL}/storage/v1/object/company-documents/${path.split("/").map(encodeURIComponent).join("/")}`;
}
async function uploadStorage(path, content) {
  const response = await fetch(storageUrl(path), {
    method: "POST",
    headers: { apikey: environment.SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SERVICE_ROLE_KEY}`, "Content-Type": "text/plain", "x-upsert": "false" },
    body: content,
  });
  assert.ok(response.ok, `Synthetic Storage upload failed: ${response.status}`);
}
async function removeStorage(path) {
  const response = await fetch(`${environment.API_URL}/storage/v1/object/company-documents`, {
    method: "DELETE",
    headers: { apikey: environment.SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  });
  assert.ok(response.ok || response.status === 404, `Synthetic Storage cleanup failed: ${response.status}`);
}
async function storageIsPrivate(path) {
  const response = await fetch(storageUrl(path), { headers: { apikey: environment.ANON_KEY } });
  return response.status >= 400;
}

const databaseContainer = run("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"]).trim().split(/\r?\n/)[0];
assert.ok(databaseContainer, "A local Supabase database container is required");
let environment;
const objectPaths = [];

async function main() {
  runNpx(["supabase", "db", "reset", "--local", "--no-seed"]);
  environment = parseEnv(runNpx(["supabase", "status", "--output", "env"]));
  assert.ok(environment.API_URL && environment.ANON_KEY && environment.SERVICE_ROLE_KEY && environment.JWT_SECRET, "Local Supabase API configuration is incomplete");

  sql(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values
      ('${OWNER_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs13-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${TECH_A}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs13-tech-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${TECH_B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs13-tech-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ('${OWNER_B}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fs13-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
    insert into public.users (id, email, full_name) values
      ('${OWNER_A}', 'fs13-owner-a@example.test', 'FS1.3 Owner A'),
      ('${TECH_A}', 'fs13-tech-a@example.test', 'FS1.3 Technician A'),
      ('${TECH_B}', 'fs13-tech-b@example.test', 'FS1.3 Technician B'),
      ('${OWNER_B}', 'fs13-owner-b@example.test', 'FS1.3 Owner B');
    insert into public.companies (id, name, slug) values
      ('${COMPANY_A}', 'FS1.3 Tenant A', 'fs13-a'),
      ('${COMPANY_B}', 'FS1.3 Tenant B', 'fs13-b');
    insert into public.company_memberships (company_id, user_id, role) values
      ('${COMPANY_A}', '${OWNER_A}', 'owner'),
      ('${COMPANY_A}', '${TECH_A}', 'technician'),
      ('${COMPANY_A}', '${TECH_B}', 'technician'),
      ('${COMPANY_B}', '${OWNER_B}', 'owner');
    insert into public.customers (id, company_id, name, created_by) values
      ('${CUSTOMER_A}', '${COMPANY_A}', 'FS1.3 Customer A', '${OWNER_A}'),
      ('${CUSTOMER_B}', '${COMPANY_B}', 'FS1.3 Customer B', '${OWNER_B}');
    insert into public.product_catalog_items (id, company_id, name, description, unit, default_unit_price_cents, default_vat_rate, is_active)
    values
      ('${PRODUCT_A}', '${COMPANY_A}', 'FS1.3 Product A', 'Catalog snapshot A', 'stuk', 1000, 21, true),
      ('${PRODUCT_B}', '${COMPANY_B}', 'FS1.3 Product B', 'Catalog snapshot B', 'meter', 2000, 9, true);
    insert into public.quotes (id, company_id, customer_id, quote_number, title, status, created_by, subtotal_cents, tax_cents, total_cents)
    values ('${QUOTE_A}', '${COMPANY_A}', '${CUSTOMER_A}', 'FS13-A', 'FS1.3 Quote A', 'accepted', '${OWNER_A}', 10000, 2100, 12100);
    update public.module_catalog set release_state = 'released' where module_key = 'field_service';
    insert into public.company_module_entitlements (company_id, module_key, source)
    values ('${COMPANY_A}', 'field_service', 'fs1_3_local_runtime'), ('${COMPANY_B}', 'field_service', 'fs1_3_local_runtime');
  `);

  const financialBefore = sql(`select coalesce(sum(subtotal_cents),0)||':'||coalesce(sum(tax_cents),0)||':'||coalesce(sum(total_cents),0) from public.quotes;`).trim();
  const created = await rpc(OWNER_A, "create_field_service_work_order", { target_company_id: COMPANY_A, target_customer_id: CUSTOMER_A, target_title: "FS1.3 execution proof", target_planning_event_id: null });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const orderA = created.body;
  assert.equal(orderA.planning_event_id, null);

  const unassignedTech = await rpc(TECH_B, "add_field_service_note", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_body: "unassigned technician" });
  assertDenied(unassignedTech, "Unassigned technician wrote a note");
  assert.equal((await rpc(OWNER_A, "add_field_service_note", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_body: "Internal preparation note" })).status, 200);

  assert.equal((await rpc(OWNER_A, "assign_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_assigned_user_id: TECH_A })).status, 200);
  assert.equal((await rpc(OWNER_A, "dispatch_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: orderA.id })).status, 200);

  const catalogMaterial = await rpc(TECH_A, "add_field_service_material", {
    target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_source_kind: "catalog",
    target_product_id: PRODUCT_A, target_description: "client value ignored", target_unit: "wrong", target_quantity: 2,
  });
  assert.equal(catalogMaterial.status, 200, JSON.stringify(catalogMaterial.body));
  assert.equal(catalogMaterial.body.description_snapshot, "Catalog snapshot A");
  assert.equal(catalogMaterial.body.unit_snapshot, "stuk");
  assert.equal(catalogMaterial.body.product_id, PRODUCT_A);
  // cross-tenant product is rejected before insertion.

  const externalMaterial = await rpc(OWNER_A, "add_field_service_material", {
    target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_source_kind: "external",
    target_product_id: null, target_description: "External cable", target_unit: "meter", target_quantity: 1.5, target_external_reason: "Not in catalog",
  });
  assert.equal(externalMaterial.status, 200);
  for (const bad of [
    { target_source_kind: "catalog", target_product_id: PRODUCT_B, target_description: "x", target_unit: "x", target_quantity: 1 },
    { target_source_kind: "external", target_product_id: null, target_description: "x", target_unit: "x", target_quantity: 1 },
    { target_source_kind: "external", target_product_id: null, target_description: "x", target_unit: "x", target_quantity: 0 },
    { target_source_kind: "external", target_product_id: null, target_description: "x", target_unit: "x", target_quantity: -1 },
  ]) assertDenied(await rpc(OWNER_A, "add_field_service_material", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_description: null, target_unit: null, target_external_reason: null, ...bad }), "Invalid material accepted");
  assertDenied(await rpc(TECH_B, "add_field_service_material", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_source_kind: "catalog", target_product_id: PRODUCT_A, target_quantity: 1 }), "Unassigned technician added material");

  const documentId = randomUUID();
  const evidencePath = `${COMPANY_A}/field-service/${orderA.id}/${documentId}/proof.txt`;
  objectPaths.push(evidencePath);
  sql(`insert into public.documents(id, company_id, uploaded_by, storage_bucket, storage_path, original_filename, mime_type, byte_size) values ('${documentId}', '${COMPANY_A}', '${OWNER_A}', 'company-documents', '${evidencePath}', 'proof.txt', 'text/plain', 17);`);
  await uploadStorage(evidencePath, "synthetic fs13");
  assert.equal(await storageIsPrivate(evidencePath), true, "Evidence object was publicly readable");
  assert.equal((await rpc(OWNER_A, "record_field_service_evidence", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_document_id: documentId, target_evidence_type: "photo" })).status, 200);

  const crossDoc = randomUUID();
  const crossPath = `${COMPANY_B}/field-service/${orderA.id}/${crossDoc}/cross.txt`;
  objectPaths.push(crossPath);
  sql(`insert into public.documents(id, company_id, uploaded_by, storage_bucket, storage_path, original_filename, mime_type, byte_size) values ('${crossDoc}', '${COMPANY_B}', '${OWNER_B}', 'company-documents', '${crossPath}', 'cross.txt', 'text/plain', 5);`);
  await uploadStorage(crossPath, "cross");
  assertDenied(await rpc(OWNER_A, "record_field_service_evidence", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_document_id: crossDoc, target_evidence_type: "document" }), "Cross-tenant document accepted");

  const orderB = await rpc(OWNER_B, "create_field_service_work_order", { target_company_id: COMPANY_B, target_customer_id: CUSTOMER_B, target_title: "FS1.3 Tenant B" });
  assert.equal(orderB.status, 200);
  assert.equal((await rpc(OWNER_B, "add_field_service_note", { target_company_id: COMPANY_B, target_work_order_id: orderB.body.id, target_body: "Tenant B execution note" })).status, 200);
  const ownARead = await dataApi(OWNER_A, `/field_service_work_order_materials?work_order_id=eq.${orderA.id}&select=product_id`);
  assert.equal(ownARead.status, 200);
  assert.ok(Array.isArray(ownARead.body) && ownARead.body.some((row) => row.product_id === PRODUCT_A), "Tenant A could not read its own execution data");
  const ownBRead = await dataApi(OWNER_B, `/field_service_work_order_notes?work_order_id=eq.${orderB.body.id}&select=id`);
  assert.equal(ownBRead.status, 200);
  assert.equal(Array.isArray(ownBRead.body) ? ownBRead.body.length : -1, 1, "Tenant B could not read its own execution data");
  const crossRead = await dataApi(OWNER_A, `/field_service_work_order_notes?work_order_id=eq.${orderB.body.id}&select=id`);
  assert.ok(crossRead.status >= 400 || (Array.isArray(crossRead.body) && crossRead.body.length === 0), "Tenant A read Tenant B execution data");
  for (const operation of [
    ["add_field_service_note", { target_company_id: COMPANY_B, target_work_order_id: orderB.body.id, target_body: "cross tenant" }],
    ["add_field_service_signoff", { target_company_id: COMPANY_B, target_work_order_id: orderB.body.id, target_customer_name: "Cross", target_confirmation_method: "verbal" }],
  ]) assertDenied(await rpc(OWNER_A, operation[0], operation[1]), "Tenant A accessed Tenant B");

  for (const table of ["field_service_work_order_materials", "field_service_work_order_notes", "field_service_work_order_evidence", "field_service_work_order_signoffs"]) {
    assertDenied(await dataApi(OWNER_A, `/${table}`, { method: "POST", body: JSON.stringify({ company_id: COMPANY_A, work_order_id: orderA.id }) }), `Direct Data API insert remained available for ${table}`);
    assertDenied(await dataApi(OWNER_A, `/${table}?company_id=eq.${COMPANY_A}`, { method: "PATCH", body: JSON.stringify({ company_id: COMPANY_B }) }), `Direct Data API update remained available for ${table}`);
    assertDenied(await dataApi(OWNER_A, `/${table}?company_id=eq.${COMPANY_A}`, { method: "DELETE" }), `Direct Data API delete remained available for ${table}`);
  }

  assert.equal((await rpc(TECH_A, "start_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: orderA.id })).status, 200);
  const signoff = await rpc(TECH_A, "record_field_service_signoff", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_customer_name: "Synthetic Customer", target_confirmation_method: "verbal" });
  assert.equal(signoff.status, 200);
  assertDenied(await rpc(OWNER_A, "record_field_service_signoff", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_customer_name: "Synthetic Customer", target_confirmation_method: "verbal" }), "Duplicate sign-off accepted");
  assert.equal((await rpc(TECH_A, "complete_field_service_work_order", { target_company_id: COMPANY_A, target_work_order_id: orderA.id })).status, 200);
  for (const operation of [
    ["add_field_service_material", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_source_kind: "external", target_description: "late", target_unit: "stuk", target_quantity: 1, target_external_reason: "late" }],
    ["add_field_service_note", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_body: "late" }],
    ["record_field_service_evidence", { target_company_id: COMPANY_A, target_work_order_id: orderA.id, target_document_id: documentId, target_evidence_type: "other" }],
  ]) assertDenied(await rpc(OWNER_A, operation[0], operation[1]), "Terminal-state execution mutation accepted");

  const readBeforeRevoke = sql(`select (select count(*) from public.field_service_work_order_materials where work_order_id='${orderA.id}') || ':' || (select count(*) from public.field_service_work_order_notes where work_order_id='${orderA.id}') || ':' || (select count(*) from public.field_service_work_order_evidence where work_order_id='${orderA.id}') || ':' || (select count(*) from public.field_service_work_order_signoffs where work_order_id='${orderA.id}');`).trim();
  sql(`update public.company_module_entitlements set is_enabled=false, revoked_at=now() where company_id='${COMPANY_A}' and module_key='field_service';`);
  const deniedRead = await dataApi(OWNER_A, `/field_service_work_order_materials?work_order_id=eq.${orderA.id}&select=id`);
  assert.ok(deniedRead.status >= 400 || (Array.isArray(deniedRead.body) && deniedRead.body.length === 0), "Revoked module exposed execution data");
  const preserved = sql(`select (select count(*) from public.field_service_work_order_materials where work_order_id='${orderA.id}') || ':' || (select count(*) from public.field_service_work_order_notes where work_order_id='${orderA.id}') || ':' || (select count(*) from public.field_service_work_order_evidence where work_order_id='${orderA.id}') || ':' || (select count(*) from public.field_service_work_order_signoffs where work_order_id='${orderA.id}');`).trim();
  assert.equal(preserved, readBeforeRevoke, "Revocation deleted execution data");
  sql(`update public.company_module_entitlements set is_enabled=true, revoked_at=null where company_id='${COMPANY_A}' and module_key='field_service';`);

  // financial totals remain unchanged by execution data.
  assert.equal(sql(`select coalesce(sum(subtotal_cents),0)||':'||coalesce(sum(tax_cents),0)||':'||coalesce(sum(total_cents),0) from public.quotes;`).trim(), financialBefore, "Execution data changed quote financial totals");
  assert.equal(sql(`select count(*) from public.invoices;`).trim(), "0", "Execution data created invoices");
  const audit = sql(`select count(*) from public.audit_logs where company_id='${COMPANY_A}' and action in ('field_service.material_added','field_service.note_added','field_service.evidence_added','field_service.signoff_recorded');`).trim();
  assert.equal(audit, "5", `Unexpected execution audit count: ${audit}`);
  console.log("FS1.3 local runtime proof: PASS");
}

try {
  await main();
} finally {
  // storage cleanup is best-effort and scoped to synthetic local objects only.
  for (const path of objectPaths) {
    try { await removeStorage(path); } catch {}
  }
  try { runNpx(["supabase", "db", "reset", "--local", "--no-seed"]); } catch {}
  try {
    const remaining = sql("select count(*) from storage.objects where bucket_id='company-documents';").trim();
    assert.equal(remaining, "0", `Local Storage objects after test: ${remaining}`);
  } catch {}
}
