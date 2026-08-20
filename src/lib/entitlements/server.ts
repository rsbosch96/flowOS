import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ModuleKey } from "@/lib/entitlements/modules";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export const moduleAccessCodes = [
  "MODULE_NOT_FOUND",
  "MODULE_NOT_RELEASED",
  "MODULE_RETIRED",
  "MODULE_NOT_ENTITLED",
  "MODULE_DEPENDENCY_MISSING",
  "MODULE_ACCESS_FORBIDDEN",
  "MODULE_AVAILABLE",
] as const;

export type ModuleAccessCode = (typeof moduleAccessCodes)[number];

function isModuleAccessCode(value: unknown): value is ModuleAccessCode {
  return typeof value === "string" && (moduleAccessCodes as readonly string[]).includes(value);
}

/**
 * The database is the canonical, tenant-bound authorization authority. Unknown
 * responses and database failures deliberately become MODULE_ACCESS_FORBIDDEN.
 */
export async function resolveCompanyModuleAccess(
  supabase: ServerSupabaseClient,
  companyId: string,
  moduleKey: ModuleKey,
): Promise<ModuleAccessCode> {
  const { data, error } = await supabase.rpc("resolve_company_module_access", {
    target_company_id: companyId,
    target_module_key: moduleKey,
  });

  return !error && isModuleAccessCode(data) ? data : "MODULE_ACCESS_FORBIDDEN";
}

/**
 * Denies on database errors and is intentionally backed by the database helper,
 * so the UI and server routes use the same tenant-bound entitlement decision.
 */
export async function hasCompanyModule(
  supabase: ServerSupabaseClient,
  companyId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  return (await resolveCompanyModuleAccess(supabase, companyId, moduleKey)) === "MODULE_AVAILABLE";
}
