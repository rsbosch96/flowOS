export const AUTH_RECOVERY_STATUS = "managed-restore-required";
export const SUPPORTED_AUTH_RECOVERY_MODE = "supabase-managed-restore-to-new-project";
export function assertManagedRestoreEvidence(evidence) {
  if (!evidence || evidence.method !== SUPPORTED_AUTH_RECOVERY_MODE) throw new Error("Auth recovery requires documented Supabase managed restore evidence.");
  for (const key of ["preBackupUserId", "preBackupCompanyId", "postRestoreUserId", "postRestoreCompanyId"]) if (typeof evidence[key] !== "string" || evidence[key].trim() === "") throw new Error(`Missing Auth recovery evidence: ${key}.`);
  if (evidence.preBackupUserId !== evidence.postRestoreUserId || evidence.preBackupCompanyId !== evidence.postRestoreCompanyId) throw new Error("Auth identity or tenant relationship mismatch after managed restore.");
  if (evidence.oldSessionUsed === true) throw new Error("Old sessions or refresh tokens cannot prove Auth recovery.");
  if (evidence.newLogin !== true || evidence.tenantIsolation !== true) throw new Error("New login and tenant-isolation evidence are required.");
  return { status: "verified", method: SUPPORTED_AUTH_RECOVERY_MODE };
}
export function planAuthRecovery(options = {}) {
  if (options.mode !== SUPPORTED_AUTH_RECOVERY_MODE) throw new Error("Auth recovery remains fail-closed: only Supabase managed restore is supported.");
  if (!options.evidence) throw new Error("Managed-restore Auth evidence is required before acceptance.");
  return assertManagedRestoreEvidence(options.evidence);
}
