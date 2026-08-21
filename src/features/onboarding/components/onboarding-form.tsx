"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTranslations } from "@/i18n/get-translations";
import type { SupportedLanguage } from "@/i18n/config";
import { LanguageSwitcher } from "@/i18n/language-switcher";

export function OnboardingForm({ hasExistingOrganization, language = "nl" }: { hasExistingOrganization: boolean; language?: SupportedLanguage }) {
  const router = useRouter();
  const { t } = getTranslations(language);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(undefined);
    const response = await fetch("/api/v1/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: formData.get("companyName"), fullName: formData.get("fullName"), language }),
    });
    const payload = await response.json() as { slug?: string; error?: { message: string } };
    if (!response.ok || !payload.slug) {
      setError(payload.error?.message ?? "Onboarding is niet gelukt.");
      setPending(false);
      return;
    }
    router.replace(`/app/${payload.slug}`);
    router.refresh();
  }

  return (
    <Card className="w-full space-y-6">
      <div className="flex items-start justify-between gap-4"><div>
        <h1 className="text-2xl font-semibold">{t("onboarding.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {hasExistingOrganization ? t("onboarding.additionalDescription") : t("onboarding.description")}
        </p>
      </div><LanguageSwitcher initialLanguage={language} /></div>
      <form action={onSubmit} className="space-y-4">
        <label className="block text-sm font-medium">
          {t("onboarding.fullName")}
          <input name="fullName" required className="mt-1 w-full rounded-md border bg-white px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          {t("onboarding.companyName")}
          <input name="companyName" required minLength={2} className="mt-1 w-full rounded-md border bg-white px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? t("onboarding.pending") : t("onboarding.submit")}</Button>
      </form>
    </Card>
  );
}
