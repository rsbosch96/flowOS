import { MessageCircle } from "lucide-react";
import type { ModuleContribution } from "@/modules/contracts";
import { aiCustomerServiceModule } from "@/lib/entitlements/modules";

/** AICS owns its optional navigation entry; Core only renders the generic slot. */
export const aiCustomerServiceModuleContribution: ModuleContribution = {
  moduleKey: aiCustomerServiceModule,
  navigation: ({ root, role }) => role === "technician" ? [] : [{
    href: `${root}/conversations`,
    icon: MessageCircle,
    label: "Klantenservice",
  }],
};
