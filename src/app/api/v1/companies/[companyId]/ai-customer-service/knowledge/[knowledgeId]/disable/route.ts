import { NextResponse } from "next/server";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ companyId: string; knowledgeId: string }> }) {
  const { companyId, knowledgeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role !== "owner") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Alleen een eigenaar kan kennis uitschakelen." } }, { status: 403 });
  if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "MODULE_UNAVAILABLE", message: "AI-klantenservice is momenteel niet beschikbaar." } }, { status: 403 });
  const { data, error } = await createAdminClient().from("ai_knowledge_entries").update({ is_enabled: false }).eq("id", knowledgeId).eq("company_id", companyId).select("id,is_enabled").maybeSingle();
  if (error || !data) return NextResponse.json({ error: { code: "KNOWLEDGE_NOT_FOUND", message: "Kennisitem niet gevonden." } }, { status: 404 });
  await recordServerAuditEvent({ companyId, actorUserId: user.id, action: "ai_customer_service.knowledge_disabled", entityType: "ai_knowledge_entry", entityId: knowledgeId, metadata: { status: "disabled" } });
  return NextResponse.json(data);
}
