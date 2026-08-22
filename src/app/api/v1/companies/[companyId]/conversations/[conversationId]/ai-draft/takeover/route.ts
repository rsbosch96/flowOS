import { NextResponse } from "next/server";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  const { companyId, conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "employee"].includes(membership.role)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot overdracht." } }, { status: 403 });
  if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "MODULE_UNAVAILABLE", message: "AI-klantenservice is momenteel niet beschikbaar." } }, { status: 403 });
  const { data: conversation } = await supabase.from("conversations").select("id").eq("id", conversationId).eq("company_id", companyId).maybeSingle();
  if (!conversation) return NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 });
  const { error } = await createAdminClient().from("ai_conversation_state").upsert({ company_id: companyId, conversation_id: conversationId, ownership_state: "human_owned", escalation_state: "escalated", latest_intent: "human_requested" }, { onConflict: "conversation_id" });
  if (error) return NextResponse.json({ error: { code: "STATE_UPDATE_FAILED", message: "Overdracht kon niet worden opgeslagen." } }, { status: 500 });
  await recordServerAuditEvent({ companyId, actorUserId: user.id, action: "ai_customer_service.human_takeover", entityType: "conversation", entityId: conversationId, metadata: { status: "human_owned" } });
  return NextResponse.json({ ok: true, ownershipState: "human_owned" });
}
