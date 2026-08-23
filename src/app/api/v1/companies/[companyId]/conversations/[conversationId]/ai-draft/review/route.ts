import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeAicsMessage } from "@/ai/customer-service-workflow";
import { withApiRequest } from "@/lib/observability/server";

const inputSchema = z.object({ reviewStatus: z.enum(["draft", "approved", "rejected"]), body: z.string().trim().min(1).max(12000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/conversations/:conversationId/ai-draft/review" }, async () => {
    let input: z.infer<typeof inputSchema>;
    try {
      const parsed = inputSchema.safeParse(await request.json());
      if (!parsed.success) return NextResponse.json({ error: { code: "AICS_INVALID_TRANSITION", message: safeAicsMessage("AICS_INVALID_TRANSITION") } }, { status: 400 });
      input = parsed.data;
    } catch {
      return NextResponse.json({ error: { code: "AICS_INVALID_TRANSITION", message: safeAicsMessage("AICS_INVALID_TRANSITION") } }, { status: 400 });
    }

    const { companyId, conversationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });
    const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
    if (!membership || !["owner", "employee"].includes(membership.role)) return NextResponse.json({ error: { code: "AICS_ACCESS_FORBIDDEN", message: safeAicsMessage("AICS_ACCESS_FORBIDDEN") } }, { status: 403 });
    if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "AICS_NOT_AVAILABLE", message: safeAicsMessage("AICS_NOT_AVAILABLE") } }, { status: 403 });

    const admin = createAdminClient();
    const { data: result, error } = await admin.rpc("review_ai_reply_draft", {
      target_company_id: companyId,
      target_conversation_id: conversationId,
      target_actor_id: user.id,
      target_review_status: input.reviewStatus,
      target_body: input.body ?? null,
    });
    const code = typeof error?.message === "string" ? error.message.split(/\s+/)[0] : "";
    const safeCode = [
      "AICS_ACCESS_FORBIDDEN",
      "AICS_NOT_AVAILABLE",
      "AICS_CONVERSATION_NOT_FOUND",
      "AICS_DRAFT_NOT_FOUND",
      "AICS_DRAFT_ALREADY_REVIEWED",
      "AICS_HUMAN_OWNED",
      "AICS_INVALID_TRANSITION",
    ].includes(code) ? code : "AICS_INVALID_TRANSITION";
    if (error || !result) {
      const status = safeCode === "AICS_ACCESS_FORBIDDEN" || safeCode === "AICS_NOT_AVAILABLE" ? 403
        : safeCode === "AICS_CONVERSATION_NOT_FOUND" || safeCode === "AICS_DRAFT_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: { code: safeCode, message: safeAicsMessage(safeCode as Parameters<typeof safeAicsMessage>[0]) } }, { status });
    }
    return NextResponse.json({ ok: true, draftId: result.draft_id, reviewStatus: result.review_status, provenance: result.provenance });
  });
}
