import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ModuleKey } from "@/lib/entitlements/modules";

/**
 * Static application-module contract. This is intentionally not a runtime
 * plugin API: only reviewed, compiled contributions can participate.
 */
export type ModuleNavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

export type ModuleNavigationContext = {
  root: string;
};

export type QuoteDetailActionContext = {
  companyId: string;
  companySlug: string;
  quoteId: string;
  quoteNumber: string;
  quoteStatus: string;
  quoteTitle: string;
};

export type ModuleContribution = {
  moduleKey: ModuleKey;
  navigation?: (context: ModuleNavigationContext) => readonly ModuleNavigationItem[];
  quoteDetailActions?: (context: QuoteDetailActionContext) => ReactNode;
};
