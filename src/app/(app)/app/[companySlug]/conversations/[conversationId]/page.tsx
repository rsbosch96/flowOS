import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ConversationActions } from "@/features/conversations/components/conversation-actions";
import { createClient } from "@/lib/supabase/server";
import { conversationStatusLabel } from "@/lib/status-labels";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { aiCustomerServiceModule } from "@/lib/entitlements/modules";
import { AicsReviewPanel } from "@/features/ai-customer-service/components/review-panel";
import type { AicsEscalationState, AicsIntent, AicsOwnershipState, AicsReviewStatus } from "@/features/ai-customer-service/ui";

export default async function ConversationPage({ params }: { params: Promise<{ companySlug: string; conversationId: string }> }) {
  const { companySlug, conversationId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("subject,status,channel,customers(name,email),conversation_messages(direction,body,created_at)")
    .eq("id", conversationId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user
    ? await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const canGenerateQuote = membership?.role === "owner" || membership?.role === "employee";
  const aicsAvailable = (membership?.role === "owner" || membership?.role === "employee")
    && await resolveCompanyModuleAccess(supabase, company.id, aiCustomerServiceModule) === "MODULE_AVAILABLE";
  const { data: aicsState } = aicsAvailable
    ? await supabase.from("ai_conversation_state").select("ownership_state,escalation_state,latest_intent").eq("company_id", company.id).eq("conversation_id", conversationId).maybeSingle()
    : { data: null };
  const { data: aicsDraft } = aicsAvailable
    ? await supabase.from("ai_reply_drafts").select("id,body,provenance,review_status,ai_run_id").eq("company_id", company.id).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const { data: aicsRun } = aicsAvailable && aicsDraft?.ai_run_id
    ? await supabase.from("ai_runs").select("metadata").eq("id", aicsDraft.ai_run_id).maybeSingle()
    : { data: null };
  const knowledgeCount = aicsRun?.metadata && typeof aicsRun.metadata === "object" && !Array.isArray(aicsRun.metadata) && typeof (aicsRun.metadata as Record<string, unknown>).knowledgeCount === "number"
    ? (aicsRun.metadata as Record<string, number>).knowledgeCount
    : undefined;
  const messages = (conversation.conversation_messages as unknown as Array<{ direction: string; body: string; created_at: string }>).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const customer = conversation.customers as unknown as { name: string; email: string | null } | null;

  return (
    <div className="max-w-3xl space-y-4">
      <Link className="text-sm text-blue-700 hover:underline" href={`/app/${companySlug}/conversations`}>← Terug naar aanvragen</Link>
      <Card>
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">{customer?.name} {customer?.email ? `· ${customer.email}` : ""}</p>
            <h1 className="mt-1 text-xl font-semibold">{conversation.subject ?? "Zonder onderwerp"}</h1>
          </div>
          <p className="rounded-full bg-slate-100 px-3 py-1 text-sm">{conversationStatusLabel(conversation.status)}</p>
        </div>
        <div className="mt-6 space-y-3">
          {messages.map((message, index) => (
            <div className={message.direction === "inbound" ? "rounded-lg bg-blue-50 p-3" : "rounded-lg bg-slate-100 p-3"} key={`${message.created_at}-${index}`}>
              <p className="text-xs font-medium uppercase text-slate-500">{message.direction === "inbound" ? "Klant" : "Interne notitie"}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
            </div>
          ))}
        </div>
        <ConversationActions companyId={company.id} companySlug={companySlug} conversationId={conversationId} status={conversation.status} canGenerateQuote={canGenerateQuote} />
      </Card>
      {aicsAvailable && <AicsReviewPanel
        companyId={company.id}
        conversationId={conversationId}
        ownershipState={(aicsState?.ownership_state as AicsOwnershipState | undefined) ?? null}
        escalationState={(aicsState?.escalation_state as AicsEscalationState | undefined) ?? null}
        intent={(aicsState?.latest_intent as AicsIntent | undefined) ?? null}
        draft={aicsDraft ? { id: aicsDraft.id, body: aicsDraft.body, provenance: aicsDraft.provenance as "ai_generated" | "human_edited", review_status: aicsDraft.review_status as AicsReviewStatus } : null}
        knowledgeCount={knowledgeCount}
      />}
    </div>
  );
}
