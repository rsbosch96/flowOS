import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  body: z.string().trim().min(2).max(2000),
  direction: z.enum(["internal", "outbound"]).default("internal"),
});

const statusSchema = z.object({ status: z.enum(["open", "pending", "resolved", "archived"]) });

async function requireConversationAccess(companyId: string, conversationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Log opnieuw in." } }, { status: 401 }) };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return { error: NextResponse.json({ error: { code: "ACCESS_CHECK_FAILED", message: "Toegang kon niet worden gecontroleerd." } }, { status: 500 }) };
  }

  if (!membership) {
    return { error: NextResponse.json({ error: { code: "FORBIDDEN", message: "Je hebt geen toegang tot deze organisatie." } }, { status: 403 }) };
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id,company_id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (conversationError) {
    return { error: NextResponse.json({ error: { code: "CONVERSATION_LOOKUP_FAILED", message: "Aanvraag kon niet worden opgehaald." } }, { status: 500 }) };
  }

  if (!conversation) {
    return { error: NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 }) };
  }

  return { supabase, user, conversation };
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) {
    return NextResponse.json({ error: { code: "INVALID_MESSAGE", message: "Schrijf eerst een bericht." } }, { status: 400 });
  }

  const { companyId, conversationId } = await params;
  const access = await requireConversationAccess(companyId, conversationId);
  if ("error" in access) return access.error;

  const { error: messageError } = await access.supabase.from("conversation_messages").insert({
    conversation_id: access.conversation.id,
    company_id: access.conversation.company_id,
    author_user_id: access.user.id,
    direction: input.data.direction,
    body: input.data.body,
  });

  if (messageError) {
    return NextResponse.json({ error: { code: "MESSAGE_SAVE_FAILED", message: "Bericht kon niet worden opgeslagen." } }, { status: 500 });
  }

  const { data: updatedConversation, error: updateError } = await access.supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), status: "pending" })
    .eq("id", access.conversation.id)
    .eq("company_id", access.conversation.company_id)
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: { code: "CONVERSATION_UPDATE_FAILED", message: "Aanvraag kon niet worden bijgewerkt." } }, { status: 500 });
  }

  if (updatedConversation?.length !== 1) {
    return NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; conversationId: string }> }) {
  const input = statusSchema.safeParse(await request.json());
  if (!input.success) {
    return NextResponse.json({ error: { code: "INVALID_STATUS", message: "Ongeldige status." } }, { status: 400 });
  }

  const { companyId, conversationId } = await params;
  const access = await requireConversationAccess(companyId, conversationId);
  if ("error" in access) return access.error;

  const { data: updatedConversation, error } = await access.supabase
    .from("conversations")
    .update({ status: input.data.status })
    .eq("id", access.conversation.id)
    .eq("company_id", access.conversation.company_id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: { code: "CONVERSATION_UPDATE_FAILED", message: "Status kon niet worden aangepast." } }, { status: 500 });
  }

  if (updatedConversation?.length !== 1) {
    return NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
