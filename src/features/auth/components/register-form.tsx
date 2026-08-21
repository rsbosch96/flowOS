"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { getTranslations } from "@/i18n/get-translations";
import type { SupportedLanguage } from "@/i18n/config";
import { mapRegistrationError } from "@/features/auth/infrastructure/registration-error";

export function RegisterForm({ language = "nl" }: { language?: SupportedLanguage }) {
  const { t } = getTranslations(language);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function onSubmit(formData: FormData) {
    setError(undefined); setMessage(undefined);
    const supabase = createClient();
    const email = String(formData.get("email"));
    const { error } = await supabase.auth.signUp({ email, password: String(formData.get("password")), options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    if (error) { setError(mapRegistrationError(error, language)); return; }
    setMessage(t("auth.confirmEmail"));
  }
  return <Card className="w-full space-y-6"><div><h1 className="text-2xl font-semibold">{t("auth.registerTitle")}</h1><p className="mt-1 text-sm text-slate-600">{t("auth.registerDescription")}</p></div><form action={onSubmit} className="space-y-4"><label className="block text-sm font-medium">{t("auth.email")}<input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label><label className="block text-sm font-medium">{t("auth.password")}<input name="password" type="password" required minLength={12} autoComplete="new-password" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}<Button type="submit" className="w-full">{t("auth.createAccount")}</Button></form><p className="text-sm text-slate-600">{t("auth.registerPrompt")} <Link className="font-medium text-blue-700" href="/login">{t("auth.login")}</Link></p></Card>;
}
