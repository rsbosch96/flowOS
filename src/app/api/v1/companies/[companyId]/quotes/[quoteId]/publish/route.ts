import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordServerAuditEvent } from "@/lib/audit/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen offertes versturen." } }, { status: 403 });
  const { data: quote } = await supabase.from("quotes").select("id,company_id,status").eq("id", quoteId).eq("company_id", companyId).maybeSingle();
  if (!quote) return NextResponse.json({ error: { message: "Offerte niet gevonden." } }, { status: 404 });
  if (quote.status !== "approved") return NextResponse.json({ error: { message: "De offerte moet eerst goedgekeurd zijn." } }, { status: 409 });
  const { data: token, error } = await supabase.rpc("publish_quote_for_customer", { target_quote_id: quote.id, target_company_id: quote.company_id, expiry_days: 30 });
  if (error || !token) return NextResponse.json({ error: { message: error?.message ?? "De klantlink kon niet worden aangemaakt." } }, { status: 409 });
  await recordServerAuditEvent({ companyId: quote.company_id, actorUserId: user.id, action: "quote.published", entityType: "quote", entityId: quote.id });
  return NextResponse.json({ url: `${new URL(request.url).origin}/offerte/${token}` });
}
