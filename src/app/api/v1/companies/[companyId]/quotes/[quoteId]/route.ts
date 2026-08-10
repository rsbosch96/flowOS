import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordServerAuditEvent } from "@/lib/audit/server";

const itemSchema = z.object({ description: z.string().trim().min(2).max(500), quantity: z.number().positive().max(100000), unit: z.string().trim().min(1).max(30), unitPriceCents: z.number().int().nonnegative(), vatRate: z.number().min(0).max(100) });
const inputSchema = z.object({ title: z.string().trim().min(3).max(160), notes: z.string().max(5000).nullable(), items: z.array(itemSchema).min(1).max(100) });

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { message: "Controleer titel en offertregels." } }, { status: 400 });
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen offertes aanpassen." } }, { status: 403 });
  const { data, error } = await supabase.rpc("update_draft_quote", {
    target_company_id: companyId,
    target_quote_id: quoteId,
    draft_title: input.data.title,
    draft_notes: input.data.notes,
    draft_items: input.data.items,
  });
  if (error || !data) return NextResponse.json({ error: { message: "Alleen conceptoffertes kunnen worden aangepast." } }, { status: 409 });
  await recordServerAuditEvent({ companyId, actorUserId: user.id, action: "quote.updated", entityType: "quote", entityId: quoteId });
  const totals = data as { subtotalCents: number; taxCents: number; totalCents: number };
  return NextResponse.json({ ok: true, totals: { subtotal: totals.subtotalCents, tax: totals.taxCents, total: totals.totalCents } });
}
