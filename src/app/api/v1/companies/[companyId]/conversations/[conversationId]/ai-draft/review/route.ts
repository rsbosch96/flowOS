import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canReviewDraft, isHumanEdit, safeAicsMessage } from "@/ai/customer-service-workflow";
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
    const { data: draft } = await admin
      .from("ai_reply_drafts")
      .select("id,review_status,provenance")
      .eq("company_id", companyId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!draft) return NextResponse.json({ error: { code: "AICS_DRAFT_NOT_FOUND", message: safeAicsMessage("AICS_DRAFT_NOT_FOUND") } }, { status: 404 });
    if (input.reviewStatus === "draft") {
      if (draft.review_status !== "draft" || !input.body) {
        return NextResponse.json({ error: { code: "AICS_DRAFT_ALREADY_REVIEWED", message: safeAicsMessage("AICS_DRAFT_ALREADY_REVIEWED") } }, { status: 409 });
      }
      const { data: editedDraft, error: editError } = await admin
        .from("ai_reply_drafts")
        .update({ body: input.body, provenance: "human_edited" })
        .eq("id", draft.id)
        .eq("company_id", companyId)
        .eq("review_status", "draft")
        .select("id,review_status,provenance")
        .maybeSingle();
      if (editError || !editedDraft) {
        return NextResponse.json({ error: { code: "AICS_INVALID_TRANSITION", message: safeAicsMessage("AICS_INVALID_TRANSITION") } }, { status: 409 });
      }
      await recordServerAuditEvent({ companyId, actorUserId: user.id, action: "ai_customer_service.draft_edited", entityType: "ai_reply_draft", entityId: draft.id, metadata: { status: "draft", provenance: "human_edited" } });
      return NextResponse.json({ ok: true, draftId: draft.id, reviewStatus: editedDraft.review_status, provenance: editedDraft.provenance });
    }
    if (!canReviewDraft(draft.review_status, input.reviewStatus)) {
      return NextResponse.json({ error: { code: "AICS_DRAFT_ALREADY_REVIEWED", message: safeAicsMessage("AICS_DRAFT_ALREADY_REVIEWED") } }, { status: 409 });
    }

    const edited = isHumanEdit(input.body);
    const { data: updated, error } = await admin
      .from("ai_reply_drafts")
      .update({
        review_status: input.reviewStatus,
        ...(input.body ? { body: input.body } : {}),
        provenance: edited ? "human_edited" : draft.provenance,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", draft.id)
      .eq("company_id", companyId)
      .eq("review_status", "draft")
      .select("id,review_status,provenance")
      .maybeSingle();
    if (error) return NextResponse.json({ error: { code: "AICS_INVALID_TRANSITION", message: "Beoordeling kon niet veilig worden opgeslagen." } }, { status: 409 });
    if (!updated) return NextResponse.json({ error: { code: "AICS_DRAFT_ALREADY_REVIEWED", message: safeAicsMessage("AICS_DRAFT_ALREADY_REVIEWED") } }, { status: 409 });

    await recordServerAuditEvent({
      companyId,
      actorUserId: user.id,
      action: input.reviewStatus === "approved" ? "ai_customer_service.draft_approved" : "ai_customer_service.draft_rejected",
      entityType: "ai_reply_draft",
      entityId: draft.id,
      metadata: { status: input.reviewStatus, provenance: updated.provenance },
    });
    return NextResponse.json({ ok: true, draftId: draft.id, reviewStatus: updated.review_status, provenance: updated.provenance });
  });
}
