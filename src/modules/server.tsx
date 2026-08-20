import "server-only";
import { ModuleContributionBoundary } from "@/modules/components/module-contribution-boundary";
import type { ModuleContribution, ModuleNavigationContext, ModuleNavigationItem, QuoteDetailActionContext } from "@/modules/contracts";
import { moduleContributions } from "@/modules/registry";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Visibility is UX only. The database resolver remains the tenant-bound source
 * used by module pages, routes and RLS, and errors deny the contribution.
 */
export async function getEnabledModuleContributions(
  supabase: ServerSupabaseClient,
  companyId: string,
): Promise<readonly ModuleContribution[]> {
  const decisions = await Promise.all(moduleContributions.map(async (contribution) => ({
    contribution,
    enabled: (await resolveCompanyModuleAccess(supabase, companyId, contribution.moduleKey)) === "MODULE_AVAILABLE",
  })));

  return decisions.filter(({ enabled }) => enabled).map(({ contribution }) => contribution);
}

export function getModuleNavigationItems(
  contributions: readonly ModuleContribution[],
  context: ModuleNavigationContext,
): readonly ModuleNavigationItem[] {
  return contributions.flatMap((contribution) => contribution.navigation?.(context) ?? []);
}

export function renderQuoteDetailModuleActions(
  contributions: readonly ModuleContribution[],
  context: QuoteDetailActionContext,
) {
  return contributions.flatMap((contribution) => {
    if (!contribution.quoteDetailActions) return [];
    const action = contribution.quoteDetailActions(context);
    if (!action) return [];

    return <ModuleContributionBoundary key={contribution.moduleKey} moduleKey={contribution.moduleKey}>
      {action}
    </ModuleContributionBoundary>;
  });
}
