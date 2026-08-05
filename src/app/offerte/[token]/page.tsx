import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CustomerQuoteActions } from "@/features/quotes/components/customer-quote-actions";

type PublicQuote = {
  quoteNumber: string;
  title: string;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  companyName: string;
  customerName: string;
  items: Array<{ description: string; quantity: number; unit: string; unitPriceCents: number; vatRate: number; lineTotalCents: number }>;
};

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!z.string().regex(/^[a-f0-9]{64}$/i).safeParse(token).success) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_quote", { raw_token: token });
  const quote = data as PublicQuote | null;
  if (!quote) notFound();

  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-3xl"><header className="mb-6"><p className="text-sm font-medium text-blue-700">{quote.companyName}</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">{quote.title}</h1><p className="mt-2 text-slate-600">Offerte {quote.quoteNumber} voor {quote.customerName}</p></header><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="divide-y">{quote.items.map((item, index) => <div className="flex justify-between gap-4 py-4" key={`${item.description}-${index}`}><div><p className="font-medium">{item.description}</p><p className="text-sm text-slate-600">{item.quantity} {item.unit} × {euro(item.unitPriceCents)} · {item.vatRate}% btw</p></div><p className="font-medium">{euro(item.lineTotalCents)}</p></div>)}</div><dl className="ml-auto mt-6 max-w-xs space-y-2"><div className="flex justify-between"><dt>Subtotaal</dt><dd>{euro(quote.subtotalCents)}</dd></div><div className="flex justify-between"><dt>BTW</dt><dd>{euro(quote.taxCents)}</dd></div><div className="flex justify-between border-t pt-2 text-lg font-semibold"><dt>Totaal</dt><dd>{euro(quote.totalCents)}</dd></div></dl></section><CustomerQuoteActions token={token} status={quote.status} /></div></main>;
}
