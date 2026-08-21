"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { getTranslations } from "@/i18n/get-translations";
import type { SupportedLanguage } from "@/i18n/config";

export function LoginForm({ language = "nl" }: { language?: SupportedLanguage }) {
  const { t } = getTranslations(language);
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function onSubmit(formData: FormData) {
    setPending(true); setError(undefined);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: String(formData.get("email")), password: String(formData.get("password")) });
    if (error) { setError("Inloggen is niet gelukt. Controleer je gegevens."); setPending(false); return; }
    router.replace("/"); router.refresh();
  }
  return <Card className="w-full space-y-6"><div><h1 className="text-2xl font-semibold">{t("auth.loginTitle")}</h1><p className="mt-1 text-sm text-slate-600">{t("auth.loginDescription")}</p></div><form action={onSubmit} className="space-y-4"><label className="block text-sm font-medium">{t("auth.email")}<input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label><label className="block text-sm font-medium">{t("auth.password")}<input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<Button type="submit" disabled={pending} className="w-full">{pending ? t("auth.loggingIn") : t("auth.login")}</Button></form><p className="text-sm text-slate-600">{t("auth.registerPrompt")} <Link className="font-medium text-blue-700" href="/register">{t("auth.register")}</Link></p></Card>;
}
