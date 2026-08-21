import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { BrandingForm } from "@/features/branding/components/branding-form";
import { getTranslations } from "@/i18n/get-translations";
import { createClient } from "@/lib/supabase/server";
import { getPreferredLanguage } from "@/i18n/server";
import { LanguageSwitcher } from "@/i18n/language-switcher";

export default async function SettingsPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params; const supabase = await createClient(); const language = await getPreferredLanguage(); const { t } = getTranslations(language);
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: template } = await supabase.from("quote_templates").select("document_title,intro_text,closing_text,accent_color,logo_storage_path").eq("company_id", company.id).eq("is_default", true).maybeSingle();
  return <div className="space-y-6"><Card><div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">{t("settings.title")}</h1><p className="mt-1 text-sm text-slate-600">{t("settings.description")}</p></div><LanguageSwitcher initialLanguage={language} persistAccount /></div><Link href={`/app/${companySlug}/settings/company-profile`} className="mt-4 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">{t("settings.companyProfile")}</Link></Card>{template ? <Card><h2 className="text-xl font-semibold">{t("settings.brandingTitle")}</h2><p className="mt-1 text-sm text-slate-600">{t("settings.brandingDescription")}</p><BrandingForm companyId={company.id} template={template} /></Card> : <Card><h2 className="text-xl font-semibold">{t("settings.brandingTitle")}</h2><p className="mt-2 text-sm text-red-600">{t("settings.templateRequired")}</p></Card>}</div>;
}
