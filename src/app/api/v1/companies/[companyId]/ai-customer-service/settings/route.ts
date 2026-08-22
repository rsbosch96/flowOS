import { NextResponse } from "next/server";
import { z } from "zod";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ assistanceEnabled: z.boolean(), reviewPolicy: z.literal("human_required").default("human_required") });

async function ownerAccess(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 }) };
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role !== "owner") return { error: NextResponse.json({ error: { code: "FORBIDDEN", message: "Alleen een eigenaar kan AI-instellingen beheren." } }, { status: 403 }) };
  if (await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service") !== "MODULE_AVAILABLE") return { error: NextResponse.json({ error: { code: "MODULE_UNAVAILABLE", message: "AI-klantenservice is momenteel niet beschikbaar." } }, { status: 403 }) };
  return { supabase, user };
}

export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await ownerAccess(companyId);
  if ("error" in access) return access.error;
  const { data, error } = await access.supabase.from("ai_customer_service_settings").select("company_id,assistance_enabled,review_policy").eq("company_id", companyId).maybeSingle();
  if (error) return NextResponse.json({ error: { code: "SETTINGS_LOOKUP_FAILED", message: "AI-instellingen konden niet worden opgehaald." } }, { status: 500 });
  return NextResponse.json(data ?? { companyId, assistanceEnabled: false, reviewPolicy: "human_required" });
}

export async function PUT(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await ownerAccess(companyId);
  if ("error" in access) return access.error;
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { code: "INVALID_SETTINGS", message: "Ongeldige AI-instellingen." } }, { status: 400 });
  const { data, error } = await createAdminClient().from("ai_customer_service_settings").upsert({ company_id: companyId, assistance_enabled: input.data.assistanceEnabled, review_policy: input.data.reviewPolicy }, { onConflict: "company_id" }).select("company_id,assistance_enabled,review_policy").single();
  if (error || !data) return NextResponse.json({ error: { code: "SETTINGS_SAVE_FAILED", message: "AI-instellingen konden niet worden opgeslagen." } }, { status: 500 });
  await recordServerAuditEvent({ companyId, actorUserId: access.user.id, action: "ai_customer_service.settings_updated", entityType: "ai_customer_service_settings", entityId: companyId, metadata: { assistance_enabled: input.data.assistanceEnabled, review_policy: input.data.reviewPolicy } });
  return NextResponse.json(data);
}
