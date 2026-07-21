import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(_: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen facturen maken." } }, { status: 403 });
  const { data: invoiceId, error } = await supabase.rpc("create_invoice_from_quote", { target_quote_id: quoteId });
  if (error || !invoiceId) return NextResponse.json({ error: { message: error?.message ?? "Factuur kon niet worden gemaakt." } }, { status: 409 });
  await supabase.from("audit_logs").insert({ company_id: companyId, actor_user_id: user.id, action: "invoice.created_from_quote", entity_type: "invoice", entity_id: invoiceId });
  return NextResponse.json({ invoiceId });
}
