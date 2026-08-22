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
    const admin = createAdminClient();
    const { data: transition, error: transitionError } = await admin.rpc("takeover_ai_conversation", {
      target_company_id: companyId,
      target_conversation_id: conversationId,
      target_actor_id: user.id,
    });
    if (transitionError) {
      const code = transitionError.message.includes("AICS_CONVERSATION_NOT_FOUND") ? "AICS_CONVERSATION_NOT_FOUND" : "AICS_INVALID_TRANSITION";
      const status = code === "AICS_CONVERSATION_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: { code, message: safeAicsMessage(code as "AICS_CONVERSATION_NOT_FOUND" | "AICS_INVALID_TRANSITION") } }, { status });
    }

    if (transition?.transitioned) {
      await recordServerAuditEvent({ companyId, actorUserId: user.id, action: "ai_customer_service.human_takeover", entityType: "conversation", entityId: conversationId, metadata: { status: "human_owned" } });
    }
    return NextResponse.json({ ok: true, ownershipState: "human_owned", alreadyOwned: Boolean(transition?.already_owned) });
  });
}
