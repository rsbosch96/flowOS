import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen offertes versturen." } }, { status: 403 });
  const { data: token, error } = await supabase.rpc("publish_quote_for_customer", { target_quote_id: quoteId, expiry_days: 30 });
  if (error || !token) return NextResponse.json({ error: { message: error?.message ?? "De klantlink kon niet worden aangemaakt." } }, { status: 409 });
  await supabase.from("audit_logs").insert({ company_id: companyId, actor_user_id: user.id, action: "quote.published", entity_type: "quote", entity_id: quoteId });
  return NextResponse.json({ url: `${new URL(request.url).origin}/offerte/${token}` });
}
