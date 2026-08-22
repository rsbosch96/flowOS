import { NextResponse } from "next/server";
import { z } from "zod";
import { accessFailureResponse, requireKnowledgeAccess, retrieveApprovedKnowledge } from "@/ai/knowledge-server";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(12000),
  sourceType: z.enum(["manual", "faq"]).default("manual"),
});

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const supabase = await createClient();
  const access = await requireKnowledgeAccess(supabase, companyId, "reader");
  if (!access.ok) return NextResponse.json(accessFailureResponse(access), { status: access.status });

  const url = new URL(request.url);
  const search = url.searchParams.get("q");
  if (search !== null) {
    const normalizedSearch = search.replace(/\s+/g, " ").trim();
    if (!normalizedSearch || normalizedSearch.length > 500) return errorResponse("KNOWLEDGE_SEARCH_INVALID", "Geef een korte zoekvraag op.", 400);
    const items = await retrieveApprovedKnowledge(supabase, companyId, normalizedSearch, { limit: 5 });
    return NextResponse.json({ items, count: items.length, nextOffset: null });
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? "20");
  const requestedOffset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 20;
  const offset = Number.isInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 10_000)) : 0;
  const admin = createAdminClient();
  let query = admin.from("ai_knowledge_entries")
    .select("id,title,content,source_type,is_enabled,is_approved,approved_by,approved_at,created_by,created_at,updated_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (access.access.role !== "owner") query = query.eq("is_enabled", true).eq("is_approved", true);
  const { data, count, error } = await query;
  if (error) return errorResponse("KNOWLEDGE_INVALID", "Kennis kon niet worden geladen.", 500);
  return NextResponse.json({ items: data ?? [], count: count ?? 0, nextOffset: (offset + limit) < (count ?? 0) ? offset + limit : null });
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const supabase = await createClient();
  const access = await requireKnowledgeAccess(supabase, companyId, "owner");
  if (!access.ok) return NextResponse.json(accessFailureResponse(access), { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("KNOWLEDGE_INVALID", "Controleer titel en inhoud.", 400); }
  const input = inputSchema.safeParse(body);
  if (!input.success) return errorResponse("KNOWLEDGE_INVALID", "Controleer titel, inhoud en brontype.", 400);
  const { data, error } = await createAdminClient().from("ai_knowledge_entries").insert({ company_id: companyId, title: input.data.title, content: input.data.content, source_type: input.data.sourceType, source_reference: null, created_by: access.access.userId }).select("id,title,is_approved,is_enabled,source_type").single();
  if (error || !data) return errorResponse("KNOWLEDGE_INVALID", "Kennis kon niet worden opgeslagen.", 400);
  await recordServerAuditEvent({ companyId, actorUserId: access.access.userId, action: "ai_customer_service.knowledge_added", entityType: "ai_knowledge_entry", entityId: data.id, metadata: { source_type: input.data.sourceType, status: "unapproved" } });
  return NextResponse.json(data, { status: 201 });
}
