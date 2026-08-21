import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { fieldServiceModule } from "@/lib/entitlements/modules";
import type { ModuleContribution } from "@/modules/contracts";

/** Field Service owns its navigation and accepted-quote entry point. */
export const fieldServiceModuleContribution: ModuleContribution = {
  moduleKey: fieldServiceModule,
  navigation: ({ root }) => [{
    href: `${root}/field-service`,
    icon: ClipboardList,
    label: "Field Service",
  }],
  quoteDetailActions: ({ companySlug, quoteId, quoteNumber, quoteStatus }) => {
    if (quoteStatus !== "accepted") return null;

    return <Link
      href={`/app/${companySlug}/field-service?quoteId=${encodeURIComponent(quoteId)}`}
      className="mt-3 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
    >
      Werkbon maken voor {quoteNumber}
    </Link>;
  },
};
