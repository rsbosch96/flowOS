import { NextResponse } from "next/server";
import { z } from "zod";
import { languageFromLocale, resolveProductLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ language: z.string().min(2).max(10) });

export async function PATCH(request: Request) {
  const parsed = schema.safeParse(await request.json());
  const language = parsed.success ? languageFromLocale(parsed.data.language) : undefined;
  if (!language) return NextResponse.json({ error: { code: "INVALID_LANGUAGE", message: "Ongeldige taalkeuze." } }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });
  const { error } = await supabase.from("users").update({ locale: resolveProductLocale(language), updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return NextResponse.json({ error: { code: "LANGUAGE_UPDATE_FAILED", message: "De taalvoorkeur kon niet worden opgeslagen." } }, { status: 500 });
  return NextResponse.json({ language, locale: resolveProductLocale(language) });
}
