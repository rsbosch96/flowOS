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
  const { data: existing, error: lookupError } = await admin.from("ai_knowledge_entries").select("id,is_enabled").eq("id", knowledgeId).eq("company_id", companyId).maybeSingle();
  if (lookupError || !existing) return NextResponse.json({ error: { code: "KNOWLEDGE_NOT_FOUND", message: "Kennisitem niet gevonden." } }, { status: 404 });
  if (!existing.is_enabled) return NextResponse.json({ error: { code: "KNOWLEDGE_DISABLED", message: "Kennisitem is al uitgeschakeld." } }, { status: 409 });
  const { data, error } = await admin.from("ai_knowledge_entries").update({ is_enabled: false }).eq("id", knowledgeId).eq("company_id", companyId).select("id,is_enabled").maybeSingle();
  if (error || !data) return NextResponse.json({ error: { code: "KNOWLEDGE_INVALID", message: "Kennisitem kon niet worden uitgeschakeld." } }, { status: 400 });
  await recordServerAuditEvent({ companyId, actorUserId: access.access.userId, action: "ai_customer_service.knowledge_disabled", entityType: "ai_knowledge_entry", entityId: knowledgeId, metadata: { status: "disabled" } });
  return NextResponse.json(data);
}
