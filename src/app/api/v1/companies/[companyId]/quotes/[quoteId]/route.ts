import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const itemSchema = z.object({ description: z.string().trim().min(2).max(500), quantity: z.number().positive().max(100000), unit: z.string().trim().min(1).max(30), unitPriceCents: z.number().int().nonnegative(), vatRate: z.number().min(0).max(100) });
const inputSchema = z.object({ title: z.string().trim().min(3).max(160), notes: z.string().max(5000).nullable(), items: z.array(itemSchema).min(1).max(100) });

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { message: "Controleer titel en offertregels." } }, { status: 400 });
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen offertes aanpassen." } }, { status: 403 });
  const items = input.data.items.map((item, index) => ({ ...item, position: index + 1, lineTotalCents: Math.round(item.quantity * item.unitPriceCents) }));
  const subtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0); const tax = items.reduce((sum, item) => sum + Math.round(item.lineTotalCents * item.vatRate / 100), 0);
  const { data: quote, error: quoteError } = await supabase.from("quotes").update({ title: input.data.title, notes: input.data.notes, subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax, updated_at: new Date().toISOString() }).eq("id", quoteId).eq("company_id", companyId).eq("status", "draft").select("id").maybeSingle();
  if (quoteError || !quote) return NextResponse.json({ error: { message: "Alleen conceptoffertes kunnen worden aangepast." } }, { status: 409 });
  const { error: deleteError } = await supabase.from("quote_items").delete().eq("quote_id", quoteId); if (deleteError) return NextResponse.json({ error: { message: "Offertregels konden niet worden vervangen." } }, { status: 500 });
  const { error: insertError } = await supabase.from("quote_items").insert(items.map((item) => ({ quote_id: quoteId, position: item.position, description: item.description, quantity: item.quantity, unit: item.unit, unit_price_cents: item.unitPriceCents, vat_rate: item.vatRate, line_total_cents: item.lineTotalCents })));
  if (insertError) return NextResponse.json({ error: { message: "Nieuwe offertregels konden niet worden opgeslagen." } }, { status: 500 });
  await supabase.from("audit_logs").insert({ company_id: companyId, actor_user_id: user.id, action: "quote.updated", entity_type: "quote", entity_id: quoteId });
  return NextResponse.json({ ok: true, totals: { subtotal, tax, total: subtotal + tax } });
}
