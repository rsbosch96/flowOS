import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { NewRequestForm } from "@/features/conversations/components/new-request-form";
import { conversationStatusLabel } from "@/lib/status-labels";
import { createClient } from "@/lib/supabase/server";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { aiCustomerServiceModule } from "@/lib/entitlements/modules";
import { ConversationFilters, type ConversationOverviewRow } from "@/features/ai-customer-service/components/conversation-filters";

export default async function ConversationsPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: conversations } = await supabase.from("conversations").select("id,subject,channel,status,last_message_at,customers(name)").eq("company_id", company.id).order("last_message_at", { ascending: false, nullsFirst: false });
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user ? await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle() : { data: null };
  const aicsAvailable = (membership?.role === "owner" || membership?.role === "employee")
    && await resolveCompanyModuleAccess(supabase, company.id, aiCustomerServiceModule) === "MODULE_AVAILABLE";
  const ids = (conversations ?? []).map((conversation) => conversation.id);
  const { data: states } = aicsAvailable && ids.length
    ? await supabase.from("ai_conversation_state").select("conversation_id,ownership_state,escalation_state,latest_intent").eq("company_id", company.id).in("conversation_id", ids)
    : { data: [] };
  const { data: drafts } = aicsAvailable && ids.length
    ? await supabase.from("ai_reply_drafts").select("conversation_id,review_status,created_at").eq("company_id", company.id).in("conversation_id", ids).order("created_at", { ascending: false })
    : { data: [] };
  const stateByConversation = new Map((states ?? []).map((state) => [state.conversation_id, state]));
  const latestDraftByConversation = new Map<string, { review_status: string }>();
  for (const draft of drafts ?? []) if (!latestDraftByConversation.has(draft.conversation_id)) latestDraftByConversation.set(draft.conversation_id, draft);
  const rows: ConversationOverviewRow[] = (conversations ?? []).map((conversation) => {
    const state = stateByConversation.get(conversation.id);
    const draft = latestDraftByConversation.get(conversation.id);
    return {
      id: conversation.id,
      subject: conversation.subject,
      customerName: (conversation.customers as unknown as { name: string } | null)?.name ?? "Geen klant",
      channel: conversation.channel,
      status: conversation.status,
      statusLabel: conversationStatusLabel(conversation.status),
      lastActivity: conversation.last_message_at,
      aicsState: state?.ownership_state ?? null,
      aicsIntent: state?.latest_intent ?? null,
      reviewNeeded: state?.ownership_state === "needs_review" || state?.escalation_state === "needs_review" || draft?.review_status === "draft",
    };
  });
  return <Card><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Aanvragen</h1><p className="mt-1 text-sm text-slate-600">Klantgesprekken en binnenkomende aanvragen.</p>{aicsAvailable && <p className="mt-2 text-sm text-blue-800">AI helpt een antwoordconcept opstellen; een medewerker beoordeelt het altijd.</p>}</div><NewRequestForm companyId={company.id} /></div><ConversationFilters companySlug={companySlug} rows={rows} aicsAvailable={aicsAvailable} /></Card>;
}
