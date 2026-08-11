import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ModuleKey } from "@/lib/entitlements/modules";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Denies on database errors and is intentionally backed by the database helper,
 * so the UI and server routes use the same tenant-bound entitlement decision.
 */
export async function hasCompanyModule(
  supabase: ServerSupabaseClient,
  companyId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_company_module", {
    target_company_id: companyId,
    target_module_key: moduleKey,
  });

  return !error && data === true;
}
