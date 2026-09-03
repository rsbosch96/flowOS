import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ companyId: string; invitationId: string }> }) {
  const { companyId, invitationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "owner") return NextResponse.json({ error: { message: "Alleen een eigenaar kan uitnodigingen intrekken." } }, { status: 403 });
  const { error } = await supabase.rpc("revoke_company_invitation", { target_company_id: companyId, target_invitation_id: invitationId });
  if (error) return NextResponse.json({ error: { message: "Uitnodiging kon niet worden ingetrokken." } }, { status: 409 });
  return NextResponse.json({ ok: true });
}

