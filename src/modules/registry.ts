import { planningModuleContribution } from "@/features/planning/module-contribution";
import type { ModuleContribution } from "@/modules/contracts";

const registeredModuleContributions = [planningModuleContribution] satisfies readonly ModuleContribution[];

function validateModuleContributions(contributions: readonly ModuleContribution[]) {
  const moduleKeys = new Set<string>();
  for (const contribution of contributions) {
    if (moduleKeys.has(contribution.moduleKey)) {
      throw new Error(`Duplicate module contribution registration: ${contribution.moduleKey}`);
    }
    moduleKeys.add(contribution.moduleKey);
  }
}

// A malformed static registration is a deployment/test error, never a hidden
// runtime bypass. Unavailable modules are filtered by the server resolver.
validateModuleContributions(registeredModuleContributions);

export const moduleContributions = registeredModuleContributions;
