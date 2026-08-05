import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const profileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kvkNumber: optionalText(32), vatNumber: optionalText(32), iban: optionalText(34), street: optionalText(160), postalCode: optionalText(24), city: optionalText(120), country: optionalText(100), phone: optionalText(40),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  website: z.string().trim().url().max(1000).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
});
const emptyToNull = (value: string | undefined) => value?.trim() || null;
const asObject = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function getOwnerAccess(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, response: NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 }) };
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "owner") return { supabase, response: NextResponse.json({ error: { message: "Alleen een eigenaar mag het bedrijfsprofiel wijzigen." } }, { status: 403 }) };
  return { supabase, response: null };
}

export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await getOwnerAccess(companyId);
  if (access.response) return access.response;
  const { data: company, error } = await access.supabase.from("companies").select("id,name,kvk_number,vat_number,iban,address,phone,email,website").eq("id", companyId).maybeSingle();
  if (error || !company) return NextResponse.json({ error: { message: "Bedrijfsprofiel niet gevonden." } }, { status: 404 });
  const { data: template } = await access.supabase.from("quote_templates").select("logo_storage_path").eq("company_id", companyId).eq("is_default", true).maybeSingle();
  return NextResponse.json({ profile: { ...company, logoUrl: template?.logo_storage_path ?? null } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const input = profileSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { message: "Controleer de bedrijfsgegevens." } }, { status: 400 });
  const { companyId } = await params;
  const access = await getOwnerAccess(companyId);
  if (access.response) return access.response;
  const { data: existing, error: existingError } = await access.supabase.from("companies").select("address").eq("id", companyId).maybeSingle();
  if (existingError || !existing) return NextResponse.json({ error: { message: "Bedrijfsprofiel niet gevonden." } }, { status: 404 });
  const address = { ...asObject(existing.address), street: emptyToNull(input.data.street), postal_code: emptyToNull(input.data.postalCode), city: emptyToNull(input.data.city), country: emptyToNull(input.data.country) };
  const { error: companyError } = await access.supabase.from("companies").update({ name: input.data.name, kvk_number: emptyToNull(input.data.kvkNumber), vat_number: emptyToNull(input.data.vatNumber), iban: emptyToNull(input.data.iban), address, phone: emptyToNull(input.data.phone), email: emptyToNull(input.data.email), website: emptyToNull(input.data.website), updated_at: new Date().toISOString() }).eq("id", companyId);
  if (companyError) return NextResponse.json({ error: { message: "Bedrijfsprofiel kon niet worden opgeslagen." } }, { status: 500 });
  const { error: templateError } = await access.supabase.from("quote_templates").update({ logo_storage_path: emptyToNull(input.data.logoUrl), updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("is_default", true);
  if (templateError) return NextResponse.json({ error: { message: "Logo kon niet worden opgeslagen." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}
