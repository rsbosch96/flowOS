import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen offertes goedkeuren." } }, { status: 403 });
  const [{ data: quote }, { data: rules }] = await Promise.all([
    supabase.from("quotes").select("total_cents").eq("id", quoteId).eq("company_id", companyId).maybeSingle(),
    supabase.from("quote_approval_rules").select("approval_threshold_cents,require_owner_above_threshold").eq("company_id", companyId).maybeSingle(),
  ]);
  if (!quote) return NextResponse.json({ error: { message: "Offerte niet gevonden." } }, { status: 404 });
  if (rules?.require_owner_above_threshold && quote.total_cents >= rules.approval_threshold_cents && membership.role !== "owner") return NextResponse.json({ error: { message: "Voor dit offertebedrag is goedkeuring door een eigenaar vereist." } }, { status: 403 });
  const { data, error } = await supabase.from("quotes").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", quoteId).eq("company_id", companyId).eq("status", "draft").select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: { message: "Offerte is niet meer als concept beschikbaar." } }, { status: 409 });
  await supabase.from("audit_logs").insert({ company_id: companyId, actor_user_id: user.id, action: "quote.approved", entity_type: "quote", entity_id: quoteId });
  return NextResponse.json({ ok: true });
}
