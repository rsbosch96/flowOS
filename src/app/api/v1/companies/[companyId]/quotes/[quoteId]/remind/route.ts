import { NextResponse } from "next/server";
import { z } from "zod";
import { sendQuoteEmail, type QuoteForDelivery } from "@/features/quotes/infrastructure/send-quote-email";
import { createClient } from "@/lib/supabase/server";
import { recordServerAuditEvent } from "@/lib/audit/server";
import { getRequestId } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";

const idempotencyKeySchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const requestId = getRequestId(request);
  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return NextResponse.json({ error: { message: "Ongeldige verzendpoging." } }, { status: 400 });
  const { companyId, quoteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen herinneringen versturen." } }, { status: 403 });
  const { data: quote } = await supabase.from("quotes").select("id,company_id,title,quote_number,status,customers(name,email),companies(name)").eq("id", quoteId).eq("company_id", companyId).maybeSingle();
  if (!quote || quote.status !== "sent") return NextResponse.json({ error: { message: "Alleen een verstuurde offerte kan worden herinnerd." } }, { status: 409 });
  const rateLimitError = await enforceRateLimit({ policy: "quote_reminder", subjectParts: [quote.company_id, quote.id], requestId, route: "/api/v1/companies/:companyId/quotes/:quoteId/remind", companyId: quote.company_id, actorId: user.id });
  if (rateLimitError) return rateLimitError;

  const result = await sendQuoteEmail({ supabase, companyId, quote: quote as unknown as QuoteForDelivery, deliveryType: "reminder", idempotencyKey: idempotencyKey.data, origin: new URL(request.url).origin });
  if (!result.ok) return NextResponse.json({ error: { message: result.message } }, { status: result.status });
  if (!result.duplicate) await recordServerAuditEvent({ companyId: quote.company_id, actorUserId: user.id, action: result.auditAction, entityType: "quote", entityId: quote.id, metadata: { delivery_id: result.deliveryId } });
  return NextResponse.json({ ok: true, idempotent: result.duplicate });
}
