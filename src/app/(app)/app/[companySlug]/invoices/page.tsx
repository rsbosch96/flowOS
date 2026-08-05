import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function InvoicesPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params; const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle(); if (!company) notFound();
  const { data: invoices } = await supabase.from("invoices").select("id,invoice_number,status,total_cents,due_date,customer_name").eq("company_id", company.id).order("created_at", { ascending: false });
  return <div className="max-w-4xl space-y-6"><div><h1 className="text-2xl font-semibold">Facturen</h1><p className="mt-1 text-sm text-slate-600">Conceptfacturen die vanuit geaccepteerde offertes zijn gemaakt.</p></div><Card className="p-0"><div className="divide-y">{(invoices ?? []).length === 0 ? <p className="p-6 text-sm text-slate-600">Nog geen facturen. Accepteer eerst een offerte en kies daarna “Maak factuur”.</p> : invoices?.map((invoice) => <Link className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50" href={`/app/${companySlug}/invoices/${invoice.id}`} key={invoice.id}><div><p className="font-medium">{invoice.invoice_number} · {invoice.customer_name ?? "Niet vastgelegd"}</p><p className="mt-1 text-sm text-slate-600">Vervalt: {invoice.due_date ?? "niet ingesteld"} · {invoice.status}</p></div><p className="font-medium">{euro(invoice.total_cents)}</p></Link>)}</div></Card></div>;
}
