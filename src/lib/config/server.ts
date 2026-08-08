import "server-only";
import { readAdminSupabaseConfig, readRuntimeConfig, RuntimeConfigError } from "./runtime";

export { RuntimeConfigError };

export function getRuntimeConfig() {
  return readRuntimeConfig(process.env);
}

export function getAdminSupabaseConfig() {
  return readAdminSupabaseConfig(process.env);
}

export function validateRuntimeConfig() {
  try {
    getRuntimeConfig();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, errorCode: error instanceof RuntimeConfigError ? error.code : "CONFIGURATION_INVALID" };
  }
}
