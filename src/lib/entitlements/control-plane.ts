import "server-only";
import type { ModuleKey } from "@/lib/entitlements/modules";
import { createAdminClient } from "@/lib/supabase/admin";

type ModuleLifecycleInput = {
  companyId: string;
  moduleKey: Exclude<ModuleKey, "core">;
  source: string;
  actorUserId?: string;
};

/**
 * Server-only control-plane adapter. A future caller must first enforce its
 * own operator authorization; browser and authenticated Data API roles have
 * no EXECUTE grant on the underlying lifecycle RPCs.
 */
async function changeModuleLifecycle(
  operation: "activate_company_module" | "deactivate_company_module",
  input: ModuleLifecycleInput,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc(operation, {
    target_company_id: input.companyId,
    target_module_key: input.moduleKey,
    [`${operation === "activate_company_module" ? "activation" : "deactivation"}_source`]: input.source,
    actor_user_id: input.actorUserId ?? null,
  });

  if (error || typeof data !== "boolean") {
    throw new Error("Module lifecycle change could not be completed.");
  }

  return data;
}

export function activateCompanyModule(input: ModuleLifecycleInput) {
  return changeModuleLifecycle("activate_company_module", input);
}

export function deactivateCompanyModule(input: ModuleLifecycleInput) {
  return changeModuleLifecycle("deactivate_company_module", input);
}
