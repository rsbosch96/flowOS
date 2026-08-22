import { NextResponse } from "next/server";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeAicsMessage } from "@/ai/customer-service-workflow";
import { withApiRequest } from "@/lib/observability/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/conversations/:conversationId/ai-draft/takeover" }, async () => {
    const { companyId, conversationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });
    const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
    if (!membership || !["owner", "employee"].includes(membership.role)) return NextResponse.json({ error: { code: "AICS_ACCESS_FORBIDDEN", message: safeAicsMessage("AICS_ACCESS_FORBIDDEN") } }, { status: 403 });
    if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "AICS_NOT_AVAILABLE", message: safeAicsMessage("AICS_NOT_AVAILABLE") } }, { status: 403 });
    const { data: conversation } = await supabase.from("conversations").select("id").eq("id", conversationId).eq("company_id", companyId).maybeSingle();
    if (!conversation) return NextResponse.json({ error: { code: "AICS_CONVERSATION_NOT_FOUND", message: safeAicsMessage("AICS_CONVERSATION_NOT_FOUND") } }, { status: 404 });

    const admin = createAdminClient();
    const { data: currentState } = await admin
      .from("ai_conversation_state")
      .select("ownership_state,escalation_state,latest_intent")
      .eq("conversation_id", conversationId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (currentState?.ownership_state === "human_owned") {
      return NextResponse.json({ ok: true, ownershipState: "human_owned", alreadyOwned: true });
    }

    let transitioned = false;
    if (currentState) {
      const { data: updated, error } = await admin
        .from("ai_conversation_state")
        .update({ ownership_state: "human_owned", escalation_state: "escalated", latest_intent: "human_requested" })
        .eq("conversation_id", conversationId)
        .eq("company_id", companyId)
        .in("ownership_state", ["ai_assisted", "needs_review"])
        .select("ownership_state")
        .maybeSingle();
      if (error) return NextResponse.json({ error: { code: "AICS_INVALID_TRANSITION", message: "Overdracht kon niet veilig worden opgeslagen." } }, { status: 409 });
      transitioned = Boolean(updated);
    } else {
      const { error } = await admin.from("ai_conversation_state").insert({
        company_id: companyId,
        conversation_id: conversationId,
        ownership_state: "human_owned",
        escalation_state: "escalated",
        latest_intent: "human_requested",
      });
      if (error) {
        const { data: raced } = await admin.from("ai_conversation_state").select("ownership_state").eq("conversation_id", conversationId).eq("company_id", companyId).maybeSingle();
        if (raced?.ownership_state === "human_owned") return NextResponse.json({ ok: true, ownershipState: "human_owned", alreadyOwned: true });
        return NextResponse.json({ error: { code: "AICS_INVALID_TRANSITION", message: "Overdracht kon niet veilig worden opgeslagen." } }, { status: 409 });
      }
      transitioned = true;
    }

    if (transitioned) {
      await recordServerAuditEvent({ companyId, actorUserId: user.id, action: "ai_customer_service.human_takeover", entityType: "conversation", entityId: conversationId, metadata: { status: "human_owned" } });
    }
    return NextResponse.json({ ok: true, ownershipState: "human_owned", alreadyOwned: false });
  });
}
