import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ZCF keeps unreleased modules denied and providers disabled", async () => {
  const earlyAccess = await read("docs/operations/early-access-runbook.md");
  const env = await read(".env.example");
  assert.match(earlyAccess, /Field Service.*planned.*inaccessible/i);
  assert.match(earlyAccess, /AI Customer Service.*planned.*inaccessible/i);
  assert.match(env, /AI_MODE=mock/);
  assert.match(env, /Resend.*disabled|no automatic email/i);
});

test("ZCF support and break-glass docs avoid secret storage", async () => {
  const runbook = await read("docs/operations/break-glass.md");
  const support = await read("docs/operations/support-operator-checklist.md");
  const incident = await read("docs/operations/incident-response.md");
  assert.match(runbook, /No secrets, tokens, customer data/);
  assert.match(support, /SUP-/);
  assert.match(incident, /incident|INC-/i);
  assert.doesNotMatch(runbook, /sk_live_|service_role\s*=/i);
});
