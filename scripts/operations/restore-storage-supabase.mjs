import { assertSafeRecoveryTarget } from "./recovery-safety.mjs";
export function planStorageRestore({ targetProjectId, environmentType, confirmation, manifest }) { assertSafeRecoveryTarget({ targetProjectId, environmentType, confirmation }); if (!manifest) throw new Error("Storage manifest is required."); return { status: "planned", targetProjectId }; }
