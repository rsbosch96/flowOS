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
  const [{ data: company }, { data: invoice }] = await Promise.all([
    supabase.from("companies").select("id,name,address").eq("id", companyId).maybeSingle(),
    supabase.from("invoices").select("invoice_number,due_at,created_at,subtotal_cents,tax_cents,total_cents,notes,customers(name,address),invoice_items(position,description,quantity,unit,unit_price_cents,vat_rate,line_total_cents)").eq("id", invoiceId).eq("company_id", companyId).maybeSingle(),
  ]);
  if (!company || !invoice) return NextResponse.json({ error: { message: "Factuur niet gevonden." } }, { status: 404 });
  const addressText = (address: unknown) => { if (!address || typeof address !== "object") return undefined; const value = address as Record<string, unknown>; return [value.street, value.postal_code, value.city].filter((part): part is string => typeof part === "string" && part.length > 0).join(", ") || undefined; };
  const items = invoice.invoice_items as unknown as Array<{ position: number; description: string; quantity: number; unit: string; unit_price_cents: number; vat_rate: number; line_total_cents: number }>;
  const customer = invoice.customers as unknown as { name: string; address: unknown } | null;
  const document = createElement(InvoicePdf, { invoice: {
    companyName: company.name, companyAddress: addressText(company.address), invoiceNumber: invoice.invoice_number,
    customerName: customer?.name ?? "Klant", customerAddress: addressText(customer?.address), dueAt: invoice.due_at, createdAt: invoice.created_at,
    subtotalCents: invoice.subtotal_cents, taxCents: invoice.tax_cents, totalCents: invoice.total_cents, notes: invoice.notes,
    items: items.sort((a, b) => a.position - b.position).map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPriceCents: item.unit_price_cents, vatRate: item.vat_rate, lineTotalCents: item.line_total_cents })),
  } });
  const pdf = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
  const safeNumber = invoice.invoice_number.replace(/[^a-zA-Z0-9_-]/g, "_");
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=factuur-${safeNumber}.pdf`, "Cache-Control": "private, no-store" } });
}
