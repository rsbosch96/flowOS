import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ApproveQuoteButton } from "@/features/quotes/components/approve-quote-button";
import { PublishQuoteButton } from "@/features/quotes/components/publish-quote-button";
import { EmailQuoteButton } from "@/features/quotes/components/email-quote-button";
import { RemindQuoteButton } from "@/features/quotes/components/remind-quote-button";
import { CreateInvoiceButton } from "@/features/quotes/components/create-invoice-button";
import { CustomerDetailsForm } from "@/features/customers/components/customer-details-form";
import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import { quoteStatusLabel } from "@/lib/status-labels";
import { getEnabledModuleContributions, renderQuoteDetailModuleActions } from "@/modules/server";
import { getPreferredLanguage } from "@/i18n/server";

type QuoteItem = { position: number; description: string; quantity: number; unit: string; unit_price_cents: number; vat_rate: number; line_total_cents: number };
type Customer = { id: string; name: string; email: string | null; address: unknown };

export default async function QuoteDetailPage({ params }: { params: Promise<{ companySlug: string; quoteId: string }> }) {
  const { companySlug, quoteId } = await params;
  const language = await getPreferredLanguage();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();

  const { data: quote } = await supabase
    .from("quotes")
    .select("id,quote_number,title,status,notes,customer_id,subtotal_cents,tax_cents,total_cents,customer_comment,customers(id,name,email,address),quote_items(position,description,quantity,unit,unit_price_cents,vat_rate,line_total_cents)")
    .eq("id", quoteId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!quote) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user ? await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle() : { data: null };
  const { data: catalogProducts } = await supabase.from("product_catalog_items").select("id,name,sku,unit,default_unit_price_cents,default_vat_rate").eq("company_id", company.id).eq("is_active", true).order("name").limit(20);
  const items = quote.quote_items as unknown as QuoteItem[];
  const customer = quote.customers as unknown as Customer | null;
  const address = asObject(customer?.address);
  const canEditCustomer = membership?.role === "owner" || membership?.role === "employee";
  const enabledModuleContributions = await getEnabledModuleContributions(supabase, company.id);

  return <div className="max-w-4xl space-y-6">
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-slate-600">{quote.quote_number}</p><h1 className="text-2xl font-semibold">{quote.title}</h1><p className="mt-1 text-sm text-slate-600">Voor {customer?.name}</p></div>
        <div className="text-right"><p className="rounded-full bg-slate-100 px-3 py-1 text-sm">{quoteStatusLabel(quote.status, language)}</p>{quote.status === "draft" && <div className="mt-3"><ApproveQuoteButton companyId={company.id} quoteId={quote.id} /></div>}{quote.status === "approved" && <div className="mt-3 flex justify-end gap-2"><PublishQuoteButton companyId={company.id} quoteId={quote.id} /><EmailQuoteButton companyId={company.id} quoteId={quote.id} /></div>}{quote.status === "sent" && <div className="mt-3 flex justify-end gap-2"><EmailQuoteButton companyId={company.id} quoteId={quote.id} /><RemindQuoteButton companyId={company.id} quoteId={quote.id} /></div>}{quote.status === "accepted" && <div className="mt-3"><CreateInvoiceButton companyId={company.id} quoteId={quote.id} companySlug={companySlug} />{renderQuoteDetailModuleActions(enabledModuleContributions, { companyId: company.id, companySlug, quoteId: quote.id, quoteNumber: quote.quote_number, quoteStatus: quote.status, quoteTitle: quote.title })}</div>}</div>
      </div>
      {quote.customer_comment && <p className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900"><strong>Klantreactie:</strong> {quote.customer_comment}</p>}
      <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{quote.notes}</pre>
    </Card>

    {customer && <Card><h2 className="font-semibold">Klantgegevens</h2>{canEditCustomer ? <CustomerDetailsForm companyId={company.id} customer={{ id: customer.id, name: customer.name, email: customer.email, street: asString(address.street), postalCode: asString(address.postal_code), city: asString(address.city), country: asString(address.country) }} /> : <p className="mt-2 text-sm text-slate-600">Alleen een eigenaar of medewerker kan klantgegevens aanpassen.</p>}</Card>}

    <Card>
      <h2 className="font-semibold">{quote.status === "draft" ? "Offerte aanpassen" : "Regels"}</h2>
      {quote.status === "draft" ? <div className="mt-4"><QuoteEditor companyId={company.id} quoteId={quote.id} initialTitle={quote.title} initialNotes={quote.notes} initialItems={items.sort((a, b) => a.position - b.position).map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPriceCents: item.unit_price_cents, vatRate: item.vat_rate }))} catalogProducts={(catalogProducts ?? []).map((product) => ({ id: product.id, name: product.name, sku: product.sku, unit: product.unit, priceCents: product.default_unit_price_cents, vatRate: product.default_vat_rate }))} /></div> : <div className="mt-4 divide-y">{items.sort((a, b) => a.position - b.position).map((item) => <div className="flex justify-between gap-6 py-3" key={item.position}><div><p>{item.description}</p><p className="text-sm text-slate-600">{item.quantity} {item.unit} × € {(item.unit_price_cents / 100).toFixed(2)} · {item.vat_rate}% btw</p></div><p className="font-medium">€ {(item.line_total_cents / 100).toFixed(2)}</p></div>)}</div>}
      <dl className="ml-auto mt-6 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><dt>Subtotaal</dt><dd>€ {(quote.subtotal_cents / 100).toFixed(2)}</dd></div><div className="flex justify-between"><dt>BTW</dt><dd>€ {(quote.tax_cents / 100).toFixed(2)}</dd></div><div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Totaal</dt><dd>€ {(quote.total_cents / 100).toFixed(2)}</dd></div></dl>
    </Card>
  </div>;
}

function asObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
