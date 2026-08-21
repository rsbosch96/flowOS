import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { defaultLanguage, languageFromLocale, resolveProductLanguage, type SupportedLanguage } from "./config";

const cookieName = "flowos-language";

function fromAcceptLanguage(value: string | null): SupportedLanguage | undefined {
  if (!value) return undefined;
  for (const candidate of value.split(",").map((part) => part.split(";")[0].trim())) {
    const language = languageFromLocale(candidate);
    if (language) return language;
  }
  return undefined;
}

export async function getPreferredLanguage(): Promise<SupportedLanguage> {
  const requestHeaders = await headers();
  const requestCookies = await cookies();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("users").select("locale").eq("id", user.id).maybeSingle();
    const accountLanguage = languageFromLocale(profile?.locale);
    if (accountLanguage) return accountLanguage;
  }
  return resolveProductLanguage(requestCookies.get(cookieName)?.value ?? fromAcceptLanguage(requestHeaders.get("accept-language")) ?? defaultLanguage);
}

export function languageCookieName() {
  return cookieName;
}
