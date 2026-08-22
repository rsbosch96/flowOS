import { NextResponse } from "next/server";
import { runAi } from "@/ai/gateway";
import { classifySupportIntent, requiresHumanReview, type SupportIntent } from "@/ai/customer-service";
import { createCustomerServiceSystemPrompt, createCustomerServiceUserPrompt } from "@/ai/prompts/customer-service";
import { AiError } from "@/ai/errors";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerEvent, withApiRequest } from "@/lib/observability/server";

function safeFailure(error: unknown) {
  if (error instanceof AiError) return { code: "AI_DRAFT_FAILED", message: "Het antwoordconcept kon niet veilig worden gemaakt." };
  return { code: "AI_DRAFT_FAILED", message: "Het antwoordconcept kon niet veilig worden gemaakt." };
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/conversations/:conversationId/ai-draft" }, async (requestId) => {
    const { companyId, conversationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
    if (membershipError || !membership || membership.role === "technician") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot AI-klantenservice." } }, { status: 403 });
    }
    const moduleAccess = await resolveCompanyModuleAccess(supabase, companyId, "ai_customer_service");
    if (moduleAccess !== "MODULE_AVAILABLE") {
      return NextResponse.json({ error: { code: moduleAccess, message: "AI-klantenservice is momenteel niet beschikbaar." } }, { status: 403 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations").select("id,company_id,customer_id,subject").eq("id", conversationId).eq("company_id", companyId).maybeSingle();
    if (conversationError || !conversation) return NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 });

    const { data: state } = await supabase.from("ai_conversation_state").select("ownership_state").eq("conversation_id", conversationId).eq("company_id", companyId).maybeSingle();
    if (state?.ownership_state === "human_owned") {
      return NextResponse.json({ error: { code: "HUMAN_OWNED", message: "Deze aanvraag is overgedragen aan een medewerker." } }, { status: 409 });
    }
    const { data: messages, error: messageError } = await supabase
      .from("conversation_messages").select("id,body,direction,created_at").eq("conversation_id", conversationId).eq("company_id", companyId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(20);
    if (messageError || !messages?.length) return NextResponse.json({ error: { code: "CONVERSATION_EMPTY", message: "Deze aanvraag bevat nog geen klantbericht." } }, { status: 422 });
    const latest = messages[0];
    const { data: customer } = conversation.customer_id
      ? await supabase.from("customers").select("name").eq("id", conversation.customer_id).eq("company_id", companyId).maybeSingle()
      : { data: null };
    const { data: knowledge } = await supabase.from("ai_knowledge_entries").select("title,content").eq("company_id", companyId).eq("is_enabled", true).eq("is_approved", true).order("updated_at", { ascending: false }).limit(10);
    const intent: SupportIntent = classifySupportIntent(latest.body);
    const userPrompt = createCustomerServiceUserPrompt({ intent, subject: conversation.subject, customerName: customer?.name ?? null, latestMessage: latest.body, approvedKnowledge: knowledge ?? [] });

    try {
      const result = await runAi({
        companyId,
        userId: user.id,
        feature: "support_reply",
        language: "nl",
        locale: "nl-NL",
        systemPrompt: createCustomerServiceSystemPrompt(),
        userPrompt,
        schema: (await import("@/ai/customer-service")).supportReplySchema,
        metadata: { source: "conversation", intent, knowledgeCount: knowledge?.length ?? 0 },
      }, async ({ data, runId }) => {
        const reviewRequired = data.requiresHumanReview || requiresHumanReview(intent);
        const { data: draftId, error: draftError } = await createAdminClient().rpc("create_ai_reply_draft", {
          target_company_id: companyId,
          target_conversation_id: conversationId,
          target_source_message_id: latest.id,
          target_ai_run_id: runId,
          target_body: data.body,
          target_actor_id: user.id,
          target_intent: intent,
          target_requires_review: reviewRequired,
        });
        if (draftError || !draftId) throw new Error("AICS_DRAFT_STORAGE_FAILED");
        return { draftId: draftId as string };
      });
      return NextResponse.json({ draftId: result.draftId, aiRunId: result.runId, intent, reviewRequired: requiresHumanReview(intent) }, { status: 201 });
    } catch (error) {
      const failure = safeFailure(error);
      logServerEvent({ level: "error", event: "ai_customer_service.draft_failed", requestId, route: "/api/v1/companies/:companyId/conversations/:conversationId/ai-draft", companyId, actorId: user.id, errorCode: failure.code });
      return NextResponse.json({ error: failure }, { status: 502 });
    }
  });
}
