import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable(),
  sku: z.string().trim().max(60).nullable(),
  unit: z.string().trim().min(1).max(30),
  priceCents: z.number().int().nonnegative(),
  vatRate: z.number().min(0).max(100),
});
const activeSchema = z.object({ isActive: z.boolean() });

async function manageCatalog(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 }) };
  const { data: member } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!member || member.role === "technician") return { supabase, error: NextResponse.json({ error: { message: "Je mag de catalogus niet beheren." } }, { status: 403 }) };
  return { supabase, error: null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; productId: string }> }) {
  const payload = await request.json() as unknown;
  const { companyId, productId } = await params;
  const access = await manageCatalog(companyId);
  if (access.error) return access.error;

  const active = activeSchema.safeParse(payload);
  if (active.success) {
    const { error } = await access.supabase.from("product_catalog_items").update({ is_active: active.data.isActive, updated_at: new Date().toISOString() }).eq("id", productId).eq("company_id", companyId);
    if (error) return NextResponse.json({ error: { message: "Productstatus kon niet worden aangepast." } }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const update = updateSchema.safeParse(payload);
  if (!update.success) return NextResponse.json({ error: { message: "Controleer naam, prijs en btw-percentage." } }, { status: 400 });
  const { error } = await access.supabase.from("product_catalog_items").update({
    name: update.data.name,
    description: update.data.description || null,
    sku: update.data.sku || null,
    unit: update.data.unit,
    default_unit_price_cents: update.data.priceCents,
    default_vat_rate: update.data.vatRate,
    updated_at: new Date().toISOString(),
  }).eq("id", productId).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: { message: "Product kon niet worden bijgewerkt." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}
