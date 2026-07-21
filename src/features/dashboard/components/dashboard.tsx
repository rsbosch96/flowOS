import Link from "next/link";
import { Bot, ClipboardList, FileText, MessageSquare, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "@/features/dashboard/queries/get-dashboard";

const metrics = [
  { key: "requests", label: "Open aanvragen", icon: MessageSquare },
  { key: "quotes", label: "Gemaakte offertes", icon: FileText },
  { key: "openTasks", label: "Openstaande taken", icon: ClipboardList },
  { key: "aiRuns", label: "AI-acties afgerond", icon: Bot },
] as const;

export function Dashboard({ data }: { data: DashboardData }) {
  return <div className="space-y-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-blue-700">{data.company.name}</p><h1 className="text-3xl font-semibold tracking-tight">Goedemorgen</h1><p className="mt-1 text-slate-600">Hier is het overzicht van je bedrijfsprocessen.</p></div><Link href={`/app/${data.company.slug}/quotes/new`} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus size={16} /> Nieuwe offerte</Link></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ key, label, icon: Icon }) => <Card key={key} className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-600">{label}</span><Icon size={18} className="text-blue-700" /></div><p className="mt-4 text-3xl font-semibold">{data[key]}</p></Card>)}</div><Card><h2 className="font-semibold">Volgende stap</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Upload een aanvraag om de AI Offerte Assistent de benodigde gegevens te laten extraheren. Elke gegenereerde offerte blijft eerst een concept voor menselijke review.</p></Card></div>;
}
