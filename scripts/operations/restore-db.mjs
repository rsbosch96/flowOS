import { assertSafeRecoveryTarget, RECOVERY_CONFIRMATION } from "./recovery-safety.mjs";
export function planDatabaseRestore({ targetProjectId, environmentType, confirmation, artifact }) { assertSafeRecoveryTarget({ targetProjectId, environmentType, confirmation }); if (!artifact) throw new Error("Database artifact is required."); return { status: "planned", targetProjectId, artifact }; }
export { RECOVERY_CONFIRMATION };
