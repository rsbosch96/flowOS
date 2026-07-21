import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function QuotesPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params; const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle(); if (!company) notFound();
  const { data: quotes } = await supabase.from("quotes").select("id,quote_number,title,status,total_cents,created_at,customers(name)").eq("company_id", company.id).order("created_at", { ascending: false });
  return <Card><div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">Offertes</h1><p className="text-sm text-slate-600">Concepten vereisen altijd menselijke review.</p></div><Link href={`/app/${companySlug}/quotes/new`} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">Nieuwe offerte</Link></div><div className="mt-6 divide-y">{quotes?.map((quote) => <Link href={`/app/${companySlug}/quotes/${quote.id}`} key={quote.id} className="flex items-center justify-between py-4 hover:bg-slate-50"><div><p className="font-medium">{quote.title}</p><p className="text-sm text-slate-600">{quote.quote_number} · {(quote.customers as unknown as { name: string } | null)?.name ?? "Onbekende klant"}</p></div><div className="text-right"><p className="font-medium">€ {(quote.total_cents / 100).toFixed(2)}</p><p className="text-sm text-slate-600">{quote.status}</p></div></Link>)}{!quotes?.length && <p className="py-8 text-sm text-slate-600">Nog geen offertes.</p>}</div></Card>;
}
