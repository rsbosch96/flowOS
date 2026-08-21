import "server-only";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createQuoteEmail } from "./quote-email-template";

type DeliveryType = "initial" | "reminder";
export type QuoteForDelivery = { id: string; company_id: string; status: string; quote_number: string; title: string; customers: { name: string; email: string | null } | null; companies: { name: string } | null };
type ReservedDelivery = { deliveryId: string; shouldSend: boolean; status: "pending" | "sent" | "failed" };

export type QuoteEmailResult =
  | { ok: true; duplicate: boolean; deliveryId: string; auditAction: "quote.emailed" | "quote.reminder_emailed" }
  | { ok: false; status: number; message: string };

function safeProviderErrorCode(error: unknown) {
  const name = typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : "UNKNOWN";
  return `RESEND_${name.replace(/[^A-Z0-9_]/gi, "_").toUpperCase().slice(0, 80)}`;
}

export async function sendQuoteEmail(input: { supabase: SupabaseClient; companyId: string; quote: QuoteForDelivery; deliveryType: DeliveryType; idempotencyKey: string; origin: string; language?: "nl" | "en" | "es" | "de" }): Promise<QuoteEmailResult> {
  const customer = input.quote.customers;
  if (!customer?.email) return { ok: false, status: 400, message: "Deze klant heeft geen e-mailadres." };
  if (!input.quote.companies?.name) return { ok: false, status: 409, message: "Bedrijfsgegevens ontbreken." };
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { ok: false, status: 503, message: "E-mail is nog niet geconfigureerd." };
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, status: 503, message: "De e-mailservice is nog niet volledig geconfigureerd." };
  }

  const { data: reservedData, error: reserveError } = await input.supabase.rpc("reserve_quote_email_delivery", {
    target_company_id: input.companyId,
    target_quote_id: input.quote.id,
    target_delivery_type: input.deliveryType,
    target_recipient_email: customer.email,
    target_idempotency_key: input.idempotencyKey,
  });
  const reserved = reservedData as ReservedDelivery | null;
  if (reserveError || !reserved) return { ok: false, status: 409, message: "De e-mail kon niet worden voorbereid." };
  const auditAction = input.deliveryType === "initial" ? "quote.emailed" as const : "quote.reminder_emailed" as const;
  if (!reserved.shouldSend) {
    if (reserved.status === "failed") return { ok: false, status: 409, message: "Deze verzendpoging is eerder mislukt. Start een nieuwe verzendpoging." };
    return { ok: true, duplicate: true, deliveryId: reserved.deliveryId, auditAction };
  }

  const tokenRpc = input.quote.status === "approved" ? "publish_quote_for_customer" : "rotate_public_quote_token";
  const { data: rawToken, error: tokenError } = await input.supabase.rpc(tokenRpc, {
    target_quote_id: input.quote.id,
    target_company_id: input.companyId,
    expiry_days: 30,
  });
  if (tokenError || typeof rawToken !== "string") {
    await admin.rpc("fail_quote_email_delivery", { target_delivery_id: reserved.deliveryId, target_company_id: input.companyId, safe_error_code: "TOKEN_ISSUE_FAILED" });
    return { ok: false, status: 409, message: "De klantlink kon niet worden gemaakt." };
  }

  const email = createQuoteEmail({
    type: input.deliveryType,
    recipientName: customer.name,
    companyName: input.quote.companies.name,
    quoteNumber: input.quote.quote_number,
    quoteTitle: input.quote.title,
    publicUrl: `${input.origin}/offerte/${rawToken}`,
    language: input.language,
  });
  const { data: providerData, error: providerError } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM,
    to: [customer.email],
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (providerError || !providerData?.id) {
    await admin.rpc("fail_quote_email_delivery", { target_delivery_id: reserved.deliveryId, target_company_id: input.companyId, safe_error_code: safeProviderErrorCode(providerError) });
    return { ok: false, status: 502, message: "De e-mail kon niet worden verstuurd." };
  }

  const { data: completed, error: completeError } = await admin.rpc("complete_quote_email_delivery", {
    target_delivery_id: reserved.deliveryId,
    target_company_id: input.companyId,
    provider_message: providerData.id,
  });
  if (completeError || !completed) return { ok: false, status: 500, message: "De verzendstatus kon niet worden opgeslagen." };
  return { ok: true, duplicate: false, deliveryId: reserved.deliveryId, auditAction };
}
