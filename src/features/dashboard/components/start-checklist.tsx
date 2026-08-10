import Link from "next/link";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";

type Setup = { companyProfileComplete: boolean; hasCatalogProduct: boolean; hasRequest: boolean };

export function StartChecklist({ companySlug, setup }: { companySlug: string; setup: Setup }) {
  const steps = [
    { label: "Bedrijfsprofiel invullen", description: "Vul je bedrijfs-, KvK-, btw- en betaalgegevens in.", href: `/app/${companySlug}/settings/company-profile`, completed: setup.companyProfileComplete },
    { label: "Producten en diensten toevoegen", description: "Leg je vaste materiaal- en arbeidsprijzen vast.", href: `/app/${companySlug}/catalog`, completed: setup.hasCatalogProduct },
    { label: "Eerste aanvraag registreren", description: "Leg een klantvraag vast en maak daarna een conceptofferte.", href: `/app/${companySlug}/conversations`, completed: setup.hasRequest },
  ];
  if (steps.every((step) => step.completed)) return null;
  return <Card><h2 className="font-semibold">Begin met FlowOS</h2><p className="mt-1 text-sm text-slate-600">Rond deze drie stappen af om je eerste offerte te maken.</p><ol className="mt-4 space-y-3">{steps.map((step) => <li key={step.href} className="flex items-start justify-between gap-4 rounded-md border border-slate-200 p-3"><div className="flex gap-3"><span aria-label={step.completed ? `${step.label} voltooid` : `${step.label} nog niet voltooid`} className={step.completed ? "mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700" : "mt-0.5 rounded-full bg-slate-100 p-1 text-slate-500"}>{step.completed ? <Check size={14} /> : <span className="block h-3.5 w-3.5" />}</span><div><p className="font-medium">{step.label}</p><p className="text-sm text-slate-600">{step.description}</p></div></div><Link href={step.href} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">{step.completed ? "Bekijken" : "Openen"}</Link></li>)}</ol></Card>;
}
