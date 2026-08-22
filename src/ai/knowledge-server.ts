import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { KNOWLEDGE_CONTEXT_ENTRY_MAX_LENGTH, KNOWLEDGE_QUERY_MAX_LENGTH, KNOWLEDGE_RESULT_LIMIT, KNOWLEDGE_SCAN_LIMIT, rankKnowledgeEntries, type KnowledgeSearchEntry } from "@/ai/knowledge-retrieval";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type KnowledgeAccess = {
  userId: string;
  role: "owner" | "employee";
};

export type KnowledgeAccessFailure = {
  ok: false;
  status: 401 | 403;
  code: "UNAUTHENTICATED" | "AICS_NOT_AVAILABLE" | "KNOWLEDGE_ACCESS_FORBIDDEN";
  message: string;
};

export type KnowledgeAccessResult = { ok: true; access: KnowledgeAccess } | KnowledgeAccessFailure;

export async function requireKnowledgeAccess(
  supabase: SupabaseClient,
  companyId: string,
  requiredRole: "reader" | "owner",
): Promise<KnowledgeAccessResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, code: "UNAUTHENTICATED", message: "Log opnieuw in." };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError || !membership || !(["owner", "employee"] as string[]).includes(membership.role)) {
    return { ok: false, status: 403, code: "KNOWLEDGE_ACCESS_FORBIDDEN", message: "Geen toegang tot kennisbeheer." };
  }
  if (requiredRole === "owner" && membership.role !== "owner") {
    return { ok: false, status: 403, code: "KNOWLEDGE_ACCESS_FORBIDDEN", message: "Alleen een eigenaar kan kennis beheren." };
  }
  const moduleAccess = await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service");
  if (moduleAccess !== "MODULE_AVAILABLE") {
    return { ok: false, status: 403, code: "AICS_NOT_AVAILABLE", message: "AI-klantenservice is momenteel niet beschikbaar." };
  }
  return { ok: true, access: { userId: user.id, role: membership.role as "owner" | "employee" } };
}

export function accessFailureResponse(failure: KnowledgeAccessFailure) {
  return { error: { code: failure.code, message: failure.message } };
}

export async function retrieveApprovedKnowledge(
  supabase: SupabaseClient,
  companyId: string,
  query: string,
  options: { limit?: number } = {},
) {
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  if (!normalizedQuery || normalizedQuery.length > KNOWLEDGE_QUERY_MAX_LENGTH) return [];

  const access = await requireKnowledgeAccess(supabase, companyId, "reader");
  if (!access.ok) return [];

  const { data } = await createAdminClient()
    .from("ai_knowledge_entries")
    .select("id,title,content,source_type,updated_at")
    .eq("company_id", companyId)
    .eq("is_enabled", true)
    .eq("is_approved", true)
    .order("updated_at", { ascending: false })
    .limit(KNOWLEDGE_SCAN_LIMIT);

  const entries = (data ?? []).filter((entry): entry is KnowledgeSearchEntry =>
    typeof entry.id === "string"
      && typeof entry.title === "string"
      && typeof entry.content === "string"
      && (entry.source_type === "manual" || entry.source_type === "faq")
      && typeof entry.updated_at === "string",
  );
  return rankKnowledgeEntries(entries, normalizedQuery, options.limit ?? KNOWLEDGE_RESULT_LIMIT).map((entry) => ({
    ...entry,
    title: entry.title.slice(0, 200),
    content: entry.content.slice(0, KNOWLEDGE_CONTEXT_ENTRY_MAX_LENGTH),
  }));
}
