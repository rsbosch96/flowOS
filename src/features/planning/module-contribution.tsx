import { CalendarDays } from "lucide-react";
import { AddQuoteToPlanningButton } from "@/features/planning/components/add-quote-to-planning-button";
import { planningModule } from "@/lib/entitlements/modules";
import type { ModuleContribution } from "@/modules/contracts";

/** Planning owns its UI contributions; Core only renders generic slots. */
export const planningModuleContribution: ModuleContribution = {
  moduleKey: planningModule,
  navigation: ({ root }) => [{
    href: `${root}/planning`,
    icon: CalendarDays,
    label: "Planning",
  }],
  quoteDetailActions: ({ companyId, companySlug, quoteId, quoteNumber, quoteStatus, quoteTitle }) => {
    if (quoteStatus !== "accepted") return null;

    return <AddQuoteToPlanningButton
      companyId={companyId}
      companySlug={companySlug}
      quoteId={quoteId}
      quoteNumber={quoteNumber}
      quoteTitle={quoteTitle}
    />;
  },
};
