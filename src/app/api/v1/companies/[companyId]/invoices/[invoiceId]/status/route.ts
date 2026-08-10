import { NextResponse } from "next/server";
import { z } from "zod";
import { logServerEvent, withApiRequest } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  status: z.enum(["sent", "paid", "void"]),
  voidReason: z.string().trim().min(2).max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; invoiceId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/invoices/:invoiceId/status" }, async (requestId) => {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { message: "Ongeldige factuurstatus." } }, { status: 400 });
  const { companyId, invoiceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen facturen aanpassen." } }, { status: 403 });
  const { data: invoice } = await supabase.from("invoices").select("id,company_id").eq("id", invoiceId).eq("company_id", companyId).maybeSingle();
  if (!invoice) return NextResponse.json({ error: { message: "Factuur niet gevonden." } }, { status: 404 });
  const rateLimitError = await enforceRateLimit({ policy: "invoice_status", subjectParts: [invoice.company_id, invoice.id], requestId, route: "/api/v1/companies/:companyId/invoices/:invoiceId/status", companyId: invoice.company_id, actorId: user.id });
  if (rateLimitError) return rateLimitError;
  const { data, error } = await supabase.rpc("transition_invoice_status", {
    target_invoice_id: invoice.id,
    target_company_id: invoice.company_id,
    target_status: input.data.status,
    requested_void_reason: input.data.voidReason ?? null,
  });
  if (error || !data) {
    logServerEvent({ level: "error", event: "invoice.status_transition_failed", requestId, route: "/api/v1/companies/:companyId/invoices/:invoiceId/status", companyId: invoice.company_id, actorId: user.id, errorCode: "INVOICE_STATUS_TRANSITION_FAILED" });
    return NextResponse.json({ error: { message: "Deze statusovergang is niet toegestaan." } }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
  });
}
