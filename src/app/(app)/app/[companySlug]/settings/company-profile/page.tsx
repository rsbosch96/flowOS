import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CompanyProfileForm, type CompanyProfile } from "@/features/company-profile/components/company-profile-form";
import { getTranslations } from "@/i18n/get-translations";
import { createClient } from "@/lib/supabase/server";

export default async function CompanyProfilePage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params; const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id,name,kvk_number,vat_number,address,phone,email,website").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: template } = await supabase.from("quote_templates").select("logo_storage_path").eq("company_id", company.id).eq("is_default", true).maybeSingle();
  const address = company.address && typeof company.address === "object" && !Array.isArray(company.address) ? company.address as Record<string, unknown> : {};
  const profile: CompanyProfile = { name: company.name, kvkNumber: company.kvk_number ?? "", vatNumber: company.vat_number ?? "", street: typeof address.street === "string" ? address.street : "", postalCode: typeof address.postal_code === "string" ? address.postal_code : "", city: typeof address.city === "string" ? address.city : "", country: typeof address.country === "string" ? address.country : "Nederland", phone: company.phone ?? "", email: company.email ?? "", website: company.website ?? "", logoUrl: template?.logo_storage_path ?? "" };
  const { t } = getTranslations();
  return <Card><h1 className="text-xl font-semibold">{t("companyProfile.title")}</h1><p className="mt-1 text-sm text-slate-600">{t("companyProfile.description")}</p><CompanyProfileForm companyId={company.id} profile={profile} /></Card>;
}
