import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeRecoveryTarget, RECOVERY_CONFIRMATION } from "../scripts/operations/recovery-safety.mjs";
import { validateStorageKey, validateStorageManifest } from "../scripts/operations/backup-storage-supabase.mjs";
import { validateDatabaseArtifact } from "../scripts/operations/backup-db.mjs";
import { assertExternalActionInventory } from "../scripts/operations/recovery-external-actions.mjs";
import { planR2Upload } from "../scripts/operations/r2-backup-transfer.mjs";
import { validateRecoveryInvariants } from "../scripts/operations/recovery-invariants.mjs";
import { planAuthRecovery, SUPPORTED_AUTH_RECOVERY_MODE } from "../scripts/operations/restore-auth.mjs";

test("recovery guard denies production and staging", () => { for (const id of ["ivifmemxvgglvnnarubt", "lkmzwhbbffppyiiiyswk"]) assert.throws(() => assertSafeRecoveryTarget({ targetProjectId: id, environmentType: "recovery", confirmation: RECOVERY_CONFIRMATION })); });
test("recovery guard fails closed for missing environment", () => assert.throws(() => assertSafeRecoveryTarget({ targetProjectId: "isolated-recovery-1", environmentType: "", confirmation: RECOVERY_CONFIRMATION })));
test("storage paths reject traversal and unapproved buckets", () => { assert.equal(validateStorageKey("company-documents", "tenant/file.pdf"), "company-documents/tenant/file.pdf"); assert.throws(() => validateStorageKey("company-documents", "../secret")); assert.throws(() => validateStorageKey("public", "x")); });
test("R2 accepts encrypted exact keys only", () => { assert.deepEqual(planR2Upload({ key: "br1/2026/database/a.dump.age", artifactPath: "a.dump.age", encrypted: true }).status, "planned"); assert.throws(() => planR2Upload({ key: "br1/2026/database/a.dump", artifactPath: "a.dump", encrypted: false })); });
test("invariant suite fails unsafe state", () => assert.equal(validateRecoveryInvariants({ seatUsage: 4, seatCapacity: 3 }).status, "failed"));
test("Auth recovery remains explicitly fail-closed", () => assert.throws(() => planAuthRecovery(), /managed restore/));
test("Auth recovery rejects unsupported import and old-session evidence", () => {
  const evidence = { method: SUPPORTED_AUTH_RECOVERY_MODE, preBackupUserId: "u", postRestoreUserId: "u", preBackupCompanyId: "c", postRestoreCompanyId: "c", newLogin: true, tenantIsolation: true, oldSessionUsed: true };
  assert.throws(() => planAuthRecovery({ mode: "direct-sql", evidence }), /managed restore/);
  assert.throws(() => planAuthRecovery({ mode: SUPPORTED_AUTH_RECOVERY_MODE, evidence }), /Old sessions/);
});
test("Auth recovery requires matching identity and tenant evidence", () => assert.throws(() => planAuthRecovery({ mode: SUPPORTED_AUTH_RECOVERY_MODE, evidence: { method: SUPPORTED_AUTH_RECOVERY_MODE, preBackupUserId: "u", postRestoreUserId: "x", preBackupCompanyId: "c", postRestoreCompanyId: "c", newLogin: true, tenantIsolation: true } }), /mismatch/));
test("Storage and database artifacts require completeness evidence", () => {
  assert.throws(() => validateStorageManifest({ objects: [{ bucket: "company-images", path: "x/a.png", byteSize: 2, sha256: "bad", tenantId: "t" }] }), /SHA/);
  assert.throws(() => validateDatabaseArtifact({ format: "custom", schemas: ["public"], sha256: "bad" }), /SHA/);
});
test("Recovery requires external-action inventory and kill switches", () => assert.throws(() => assertExternalActionInventory({ reviewed: ["pg_cron"], providerKillSwitches: true }), /incomplete/));
