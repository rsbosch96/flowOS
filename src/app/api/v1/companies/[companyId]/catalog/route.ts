import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ name: z.string().trim().min(2).max(160), sku: z.string().trim().max(60).nullable(), unit: z.string().trim().min(1).max(30), priceCents: z.number().int().nonnegative(), vatRate: z.number().min(0).max(100) });
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const body = schema.safeParse(await request.json()); if (!body.success) return NextResponse.json({ error: { message: "Controleer productnaam en prijs." } }, { status: 400 });
  const { companyId } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: member } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle(); if (!member || member.role === "technician") return NextResponse.json({ error: { message: "Je mag de catalogus niet beheren." } }, { status: 403 });
  const { error } = await supabase.from("product_catalog_items").insert({ company_id: companyId, name: body.data.name, sku: body.data.sku || null, unit: body.data.unit, default_unit_price_cents: body.data.priceCents, default_vat_rate: body.data.vatRate });
  if (error) return NextResponse.json({ error: { message: "Product kon niet worden opgeslagen. Controleer of migratie 007 is uitgevoerd." } }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
