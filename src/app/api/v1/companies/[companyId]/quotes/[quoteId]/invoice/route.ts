import { NextResponse } from "next/server";
import { z } from "zod";
import { logServerEvent, withApiRequest } from "@/lib/observability/server";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const isValidIsoDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const invoiceDetailLabels: Record<string, string> = {
  company_name: "bedrijfsnaam", company_kvk: "KvK-nummer", company_vat_number: "btw-nummer", company_iban: "IBAN",
  company_street: "bedrijfsadres: straat en huisnummer", company_postal_code: "bedrijfsadres: postcode", company_city: "bedrijfsadres: plaats", company_country: "bedrijfsadres: land",
  customer_name: "klantnaam", customer_street: "klantadres: straat en huisnummer", customer_postal_code: "klantadres: postcode", customer_city: "klantadres: plaats", customer_country: "klantadres: land",
};

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/quotes/:quoteId/invoice" }, async (requestId) => {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success || !isValidIsoDate(input.success ? input.data.serviceDate : "")) return NextResponse.json({ error: { code: "INVOICE_SERVICE_DATE_REQUIRED", message: "Vul een geldige leverdatum in." } }, { status: 422 });

  const { companyId, quoteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen facturen maken." } }, { status: 403 });
  const { data: quote } = await supabase.from("quotes").select("id,company_id,status").eq("id", quoteId).eq("company_id", companyId).maybeSingle();
  if (!quote) return NextResponse.json({ error: { message: "Offerte niet gevonden." } }, { status: 404 });
  if (quote.status !== "accepted") return NextResponse.json({ error: { message: "Alleen een geaccepteerde offerte kan worden gefactureerd." } }, { status: 409 });

  const { data: invoiceId, error } = await supabase.rpc("create_invoice_from_quote", {
    target_quote_id: quote.id,
    target_company_id: quote.company_id,
    target_service_date: input.data.serviceDate,
  });
  if (error?.code === "P0001" && error.message === "INVOICE_PARTY_DETAILS_MISSING") {
    const missingFields = (error.details ?? "").split(",").map((field) => invoiceDetailLabels[field]).filter((field): field is string => Boolean(field));
    return NextResponse.json({ error: { code: "INVOICE_PARTY_DETAILS_MISSING", message: `Vul eerst de ontbrekende factuurgegevens aan: ${missingFields.join(", ")}.`, fields: missingFields } }, { status: 422 });
  }
  if (error?.code === "P0001" && (error.message === "INVOICE_SERVICE_DATE_REQUIRED" || error.message === "INVOICE_SERVICE_DATE_INVALID")) return NextResponse.json({ error: { code: "INVOICE_SERVICE_DATE_REQUIRED", message: "Vul een geldige leverdatum in." } }, { status: 422 });
  if (error || !invoiceId) {
    logServerEvent({ level: "error", event: "invoice.create_failed", requestId, route: "/api/v1/companies/:companyId/quotes/:quoteId/invoice", companyId: quote.company_id, actorId: user.id, errorCode: "INVOICE_CREATE_FAILED" });
    return NextResponse.json({ error: { message: "Factuur kon niet worden gemaakt." } }, { status: 409 });
  }
  return NextResponse.json({ invoiceId });
  });
}
