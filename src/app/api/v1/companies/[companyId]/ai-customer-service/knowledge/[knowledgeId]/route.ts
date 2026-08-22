import { NextResponse } from "next/server";
import { accessFailureResponse, requireKnowledgeAccess } from "@/ai/knowledge-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string; knowledgeId: string }> }) {
  const { companyId, knowledgeId } = await params;
  const supabase = await createClient();
  const access = await requireKnowledgeAccess(supabase, companyId, "reader");
  if (!access.ok) return NextResponse.json(accessFailureResponse(access), { status: access.status });

  let query = createAdminClient().from("ai_knowledge_entries")
    .select("id,title,content,source_type,is_enabled,is_approved,approved_by,approved_at,created_by,created_at,updated_at")
    .eq("id", knowledgeId)
    .eq("company_id", companyId);
  if (access.access.role !== "owner") query = query.eq("is_enabled", true).eq("is_approved", true);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return NextResponse.json({ error: { code: "KNOWLEDGE_NOT_FOUND", message: "Kennisitem niet gevonden." } }, { status: 404 });
  return NextResponse.json(data);
}
