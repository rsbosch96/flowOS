import { createElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { InvoicePdf } from "@/features/invoices/infrastructure/invoice-pdf";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string; invoiceId: string }> }) {
  const { companyId, invoiceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: invoice } = await supabase.from("invoices").select("invoice_number,invoice_date,due_date,service_date,subtotal_cents,tax_cents,total_cents,notes,company_name,company_address,company_postal_code,company_city,company_country,company_kvk,company_vat_number,company_iban,company_email,company_phone,customer_name,customer_address,customer_postal_code,customer_city,customer_country,customer_email,invoice_items(position,description,quantity,unit,unit_price_cents,vat_rate,line_total_cents)").eq("id", invoiceId).eq("company_id", companyId).maybeSingle();
  if (!invoice) return NextResponse.json({ error: { message: "Factuur niet gevonden." } }, { status: 404 });
  const items = invoice.invoice_items as unknown as Array<{ position: number; description: string; quantity: number; unit: string; unit_price_cents: number; vat_rate: number; line_total_cents: number }>;
  const addressText = (...parts: Array<string | null>) => parts.filter((part): part is string => Boolean(part)).join(", ") || undefined;
  const document = createElement(InvoicePdf, { invoice: {
    companyName: invoice.company_name ?? "Niet vastgelegd", companyAddress: addressText(invoice.company_address, invoice.company_postal_code, invoice.company_city, invoice.company_country), invoiceNumber: invoice.invoice_number,
    companyKvk: invoice.company_kvk, companyVatNumber: invoice.company_vat_number, companyIban: invoice.company_iban, companyEmail: invoice.company_email, companyPhone: invoice.company_phone,
    customerName: invoice.customer_name ?? "Niet vastgelegd", customerAddress: addressText(invoice.customer_address, invoice.customer_postal_code, invoice.customer_city, invoice.customer_country), customerEmail: invoice.customer_email, dueAt: invoice.due_date, serviceDate: invoice.service_date, createdAt: invoice.invoice_date,
    subtotalCents: invoice.subtotal_cents, taxCents: invoice.tax_cents, totalCents: invoice.total_cents, notes: invoice.notes,
    items: items.sort((a, b) => a.position - b.position).map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPriceCents: item.unit_price_cents, vatRate: item.vat_rate, lineTotalCents: item.line_total_cents })),
  } });
  const pdf = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
  const safeNumber = invoice.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=factuur-${safeNumber}.pdf`, "Cache-Control": "private, no-store" } });
}
