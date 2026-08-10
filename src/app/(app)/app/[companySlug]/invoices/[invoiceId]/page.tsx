import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { DownloadInvoicePdfButton } from "@/features/invoices/components/download-invoice-pdf-button";
import { InvoiceStatusActions } from "@/features/invoices/components/invoice-status-actions";
import { invoiceStatusLabel } from "@/lib/status-labels";

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function InvoicePage({ params }: { params: Promise<{ companySlug: string; invoiceId: string }> }) {
  const { companySlug, invoiceId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: invoice } = await supabase.from("invoices").select("invoice_number,status,due_date,subtotal_cents,tax_cents,total_cents,notes,company_name,customer_name,customer_email,invoice_items(position,description,quantity,unit,unit_price_cents,vat_rate,line_total_cents)").eq("id", invoiceId).eq("company_id", company.id).maybeSingle();
  if (!invoice) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user ? await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle() : { data: null };
  const canManageStatus = membership?.role === "owner" || membership?.role === "employee";
  const items = invoice.invoice_items as unknown as Array<{ position: number; description: string; quantity: number; unit: string; unit_price_cents: number; vat_rate: number; line_total_cents: number }>;
  return <div className="max-w-3xl"><Card><div className="flex items-start justify-between gap-4"><p className="text-sm text-slate-600">{invoice.company_name ?? "Niet vastgelegd"}</p><DownloadInvoicePdfButton companyId={company.id} invoiceId={invoiceId} /></div><div className="mt-2 flex justify-between gap-4"><div><h1 className="text-2xl font-semibold">Factuur {invoice.invoice_number}</h1><p className="mt-1 text-sm text-slate-600">Voor {invoice.customer_name ?? "Niet vastgelegd"}{invoice.customer_email ? ` · ${invoice.customer_email}` : ""}</p></div><p className="rounded-full bg-slate-100 px-3 py-1 text-sm">{invoiceStatusLabel(invoice.status)}</p></div><p className="mt-3 text-sm text-slate-600">Betaaltermijn: {invoice.due_date ?? "nog niet ingesteld"}</p><InvoiceStatusActions companyId={company.id} invoiceId={invoiceId} status={invoice.status} canManage={canManageStatus} /><div className="mt-6 divide-y border-y">{items.sort((a, b) => a.position - b.position).map((item) => <div className="flex justify-between gap-4 py-3" key={item.position}><div><p>{item.description}</p><p className="text-sm text-slate-600">{item.quantity} {item.unit} x {euro(item.unit_price_cents)} · {item.vat_rate}% btw</p></div><p className="font-medium">{euro(item.line_total_cents)}</p></div>)}</div><dl className="ml-auto mt-6 max-w-xs space-y-2"><div className="flex justify-between"><dt>Subtotaal</dt><dd>{euro(invoice.subtotal_cents)}</dd></div><div className="flex justify-between"><dt>BTW</dt><dd>{euro(invoice.tax_cents)}</dd></div><div className="flex justify-between border-t pt-2 text-lg font-semibold"><dt>Totaal</dt><dd>{euro(invoice.total_cents)}</dd></div></dl>{invoice.notes && <p className="mt-6 whitespace-pre-wrap text-sm text-slate-700">{invoice.notes}</p>}</Card></div>;
}
