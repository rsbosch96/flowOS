import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ reviewStatus: z.enum(["approved", "rejected"]), body: z.string().trim().min(1).max(12000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { code: "INVALID_REVIEW", message: "Ongeldige beoordeling." } }, { status: 400 });
  const { companyId, conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "employee"].includes(membership.role)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot beoordeling." } }, { status: 403 });
  if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "MODULE_UNAVAILABLE", message: "AI-klantenservice is momenteel niet beschikbaar." } }, { status: 403 });
  const admin = createAdminClient();
  const { data: draft } = await admin.from("ai_reply_drafts").select("id").eq("company_id", companyId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!draft) return NextResponse.json({ error: { code: "DRAFT_NOT_FOUND", message: "Antwoordconcept niet gevonden." } }, { status: 404 });
  const { error } = await admin.from("ai_reply_drafts").update({ review_status: input.data.reviewStatus, body: input.data.body, provenance: input.data.body ? "human_edited" : "ai_generated", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", draft.id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: { code: "REVIEW_FAILED", message: "Beoordeling kon niet worden opgeslagen." } }, { status: 500 });
  await recordServerAuditEvent({ companyId, actorUserId: user.id, action: input.data.reviewStatus === "approved" ? "ai_customer_service.draft_approved" : "ai_customer_service.draft_rejected", entityType: "ai_reply_draft", entityId: draft.id, metadata: { status: input.data.reviewStatus } });
  return NextResponse.json({ ok: true, draftId: draft.id, reviewStatus: input.data.reviewStatus });
}
