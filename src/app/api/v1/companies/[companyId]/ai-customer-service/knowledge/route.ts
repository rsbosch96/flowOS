import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(12000),
  sourceType: z.enum(["manual", "faq", "catalog", "document_reference"]).default("manual"),
  sourceReference: z.string().uuid().nullable().optional(),
});

async function requireOwner(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 }) };
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role !== "owner") return { error: NextResponse.json({ error: { code: "FORBIDDEN", message: "Alleen een eigenaar kan kennis beheren." } }, { status: 403 }) };
  if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return { error: NextResponse.json({ error: { code: "MODULE_UNAVAILABLE", message: "AI-klantenservice is momenteel niet beschikbaar." } }, { status: 403 }) };
  return { supabase, user };
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await requireOwner(companyId);
  if ("error" in access) return access.error;
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { code: "INVALID_KNOWLEDGE", message: "Controleer titel en inhoud." } }, { status: 400 });
  const { data, error } = await createAdminClient().from("ai_knowledge_entries").insert({ company_id: companyId, title: input.data.title, content: input.data.content, source_type: input.data.sourceType, source_reference: input.data.sourceReference ?? null, created_by: access.user.id }).select("id,title,is_approved").single();
  if (error || !data) return NextResponse.json({ error: { code: "KNOWLEDGE_SAVE_FAILED", message: "Kennis kon niet worden opgeslagen." } }, { status: 500 });
  await recordServerAuditEvent({ companyId, actorUserId: access.user.id, action: "ai_customer_service.knowledge_added", entityType: "ai_knowledge_entry", entityId: data.id, metadata: { source_type: input.data.sourceType, status: "unapproved" } });
  return NextResponse.json(data, { status: 201 });
}
