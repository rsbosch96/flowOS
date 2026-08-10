import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { NewRequestForm } from "@/features/conversations/components/new-request-form";
import { conversationStatusLabel } from "@/lib/status-labels";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationsPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: conversations } = await supabase.from("conversations").select("id,subject,channel,status,last_message_at,customers(name)").eq("company_id", company.id).order("last_message_at", { ascending: false, nullsFirst: false });
  return <Card><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Aanvragen</h1><p className="mt-1 text-sm text-slate-600">Klantgesprekken en binnenkomende aanvragen.</p></div><NewRequestForm companyId={company.id} /></div><div className="mt-6 divide-y">{conversations?.map((conversation) => <Link href={`/app/${companySlug}/conversations/${conversation.id}`} key={conversation.id} className="flex items-center justify-between py-3 hover:bg-slate-50"><div><p className="font-medium">{conversation.subject ?? "Zonder onderwerp"}</p><p className="text-sm text-slate-600">{(conversation.customers as unknown as { name: string } | null)?.name ?? "Geen klant"} · {conversation.channel}</p></div><p className="text-sm text-slate-600">{conversationStatusLabel(conversation.status)}</p></Link>)}{!conversations?.length && <p className="py-8 text-sm text-slate-600">Nog geen aanvragen. Leg hierboven een telefoontje of e-mail vast, of laat klanten via hun offertelink een vraag stellen.</p>}</div></Card>;
}
