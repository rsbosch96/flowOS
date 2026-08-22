import { NextResponse } from "next/server";
import { accessFailureResponse, requireKnowledgeAccess } from "@/ai/knowledge-server";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ companyId: string; knowledgeId: string }> }) {
  const { companyId, knowledgeId } = await params;
  const supabase = await createClient();
  const access = await requireKnowledgeAccess(supabase, companyId, "owner");
  if (!access.ok) return NextResponse.json(accessFailureResponse(access), { status: access.status });
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin.from("ai_knowledge_entries").select("id,is_approved,is_enabled").eq("id", knowledgeId).eq("company_id", companyId).maybeSingle();
  if (lookupError || !existing) return NextResponse.json({ error: { code: "KNOWLEDGE_NOT_FOUND", message: "Kennisitem niet gevonden." } }, { status: 404 });
  if (existing.is_approved) return NextResponse.json({ error: { code: "KNOWLEDGE_ALREADY_APPROVED", message: "Kennisitem is al goedgekeurd." } }, { status: 409 });
  if (!existing.is_enabled) return NextResponse.json({ error: { code: "KNOWLEDGE_DISABLED", message: "Kennisitem is uitgeschakeld." } }, { status: 409 });
  const { data, error } = await admin.from("ai_knowledge_entries").update({ is_approved: true, approved_by: access.access.userId, approved_at: new Date().toISOString() }).eq("id", knowledgeId).eq("company_id", companyId).select("id,is_approved,approved_by,approved_at").maybeSingle();
  if (error || !data) return NextResponse.json({ error: { code: "KNOWLEDGE_INVALID", message: "Kennisitem kon niet worden goedgekeurd." } }, { status: 400 });
  await recordServerAuditEvent({ companyId, actorUserId: access.access.userId, action: "ai_customer_service.knowledge_approved", entityType: "ai_knowledge_entry", entityId: knowledgeId, metadata: { status: "approved" } });
  return NextResponse.json(data);
}
