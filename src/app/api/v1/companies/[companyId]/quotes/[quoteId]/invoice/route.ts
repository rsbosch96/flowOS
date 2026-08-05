import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const invoiceDetailLabels: Record<string, string> = {
  company_name: "bedrijfsnaam",
  company_kvk: "KvK-nummer",
  company_vat_number: "btw-nummer",
  company_iban: "IBAN",
  company_street: "bedrijfsadres: straat en huisnummer",
  company_postal_code: "bedrijfsadres: postcode",
  company_city: "bedrijfsadres: plaats",
  company_country: "bedrijfsadres: land",
  customer_name: "klantnaam",
  customer_street: "klantadres: straat en huisnummer",
  customer_postal_code: "klantadres: postcode",
  customer_city: "klantadres: plaats",
  customer_country: "klantadres: land",
};

export async function POST(_: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const { companyId, quoteId } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen facturen maken." } }, { status: 403 });
  const { data: quote } = await supabase.from("quotes").select("id,company_id,status").eq("id", quoteId).eq("company_id", companyId).maybeSingle();
  if (!quote) return NextResponse.json({ error: { message: "Offerte niet gevonden." } }, { status: 404 });
  if (quote.status !== "accepted") return NextResponse.json({ error: { message: "Alleen een geaccepteerde offerte kan worden gefactureerd." } }, { status: 409 });
  const { data: invoiceId, error } = await supabase.rpc("create_invoice_from_quote", { target_quote_id: quote.id, target_company_id: quote.company_id });
  if (error?.code === "P0001" && error.message === "INVOICE_PARTY_DETAILS_MISSING") {
    const missingFields = (error.details ?? "").split(",").map((field) => invoiceDetailLabels[field]).filter((field): field is string => Boolean(field));
    return NextResponse.json({ error: { code: "INVOICE_PARTY_DETAILS_MISSING", message: `Vul eerst de ontbrekende factuurgegevens aan: ${missingFields.join(", ")}.`, fields: missingFields } }, { status: 422 });
  }
  if (error || !invoiceId) return NextResponse.json({ error: { message: error?.message ?? "Factuur kon niet worden gemaakt." } }, { status: 409 });
  return NextResponse.json({ invoiceId });
}
