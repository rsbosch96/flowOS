"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatWorkOrderDate, workOrderStatusLabel } from "@/features/field-service/presentation";

export type WorkOrderListData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  customerId: string;
  customerName: string;
  quoteId: string | null;
  planningEventId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  updatedAt: string;
};

type Customer = { id: string; name: string };
type Quote = { id: string; quoteNumber: string; title: string; customerId: string };
type PlanningEvent = { id: string; title: string; starts_at: string; status: string };
type Member = { id: string; role: string; label: string };

const inputClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export function WorkOrderList({ companyId, companySlug, workOrders, customers, quotes, planningEvents, members, canManage, preselectedQuote }: {
  companyId: string;
  companySlug: string;
  workOrders: WorkOrderListData[];
  customers: Customer[];
  quotes: Quote[];
  planningEvents: PlanningEvent[];
  members: Member[];
  canManage: boolean;
  preselectedQuote: Quote | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    customerId: preselectedQuote?.customerId ?? "",
    quoteId: preselectedQuote?.id ?? "",
    planningEventId: "",
    assignedUserId: "",
    title: preselectedQuote ? `Werkbon ${preselectedQuote.quoteNumber}` : "",
    description: "",
  });

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/field-service/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, customerId: form.customerId, quoteId: form.quoteId || null, planningEventId: form.planningEventId || null, assignedUserId: form.assignedUserId || null, description: form.description || null }),
    });
    const payload = await response.json() as { workOrder?: { id?: string }; error?: { message?: string } };
    setPending(false);
    if (!response.ok || !payload.workOrder?.id) {
      setError(payload.error?.message ?? "Werkbon kon niet worden aangemaakt.");
      return;
    }
    router.push(`/app/${companySlug}/field-service/${payload.workOrder.id}`);
  }

  function selectQuote(value: string) {
    const quote = quotes.find((entry) => entry.id === value);
    setForm((current) => ({ ...current, quoteId: value, customerId: quote?.customerId ?? current.customerId, title: quote && !current.title ? `Werkbon ${quote.quoteNumber}` : current.title }));
  }

  return <div className="space-y-6">
    {canManage && <form onSubmit={create} className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">Nieuwe werkbon</h2><p className="mt-1 text-sm text-slate-600">Koppel waar nodig een klant, geaccepteerde offerte en planning-item.</p></div>
        {preselectedQuote && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">Geaccepteerde offerte voorgeselecteerd</span>}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Titel<input className={inputClass} value={form.title} minLength={2} maxLength={160} required onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="text-sm font-medium">Klant<select className={inputClass} value={form.customerId} required onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">Kies een klant</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label className="text-sm font-medium">Geaccepteerde offerte (optioneel)<select className={inputClass} value={form.quoteId} onChange={(event) => selectQuote(event.target.value)}><option value="">Geen offerte gekoppeld</option>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quoteNumber} · {quote.title}</option>)}</select></label>
        <label className="text-sm font-medium">Planning-item (optioneel)<select className={inputClass} value={form.planningEventId} onChange={(event) => setForm({ ...form, planningEventId: event.target.value })}><option value="">Geen planning-item gekoppeld</option>{planningEvents.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatWorkOrderDate(event.starts_at)}</option>)}</select></label>
        <label className="text-sm font-medium">Verantwoordelijke (optioneel)<select className={inputClass} value={form.assignedUserId} onChange={(event) => setForm({ ...form, assignedUserId: event.target.value })}><option value="">Nog niet toegewezen</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label} · {member.role}</option>)}</select></label>
        <label className="text-sm font-medium md:col-span-2">Omschrijving<textarea className={`${inputClass} min-h-24`} value={form.description} maxLength={4000} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={pending}>{pending ? "Aanmaken…" : "Werkbon aanmaken"}</Button>{error && <p className="text-sm text-red-700" role="alert">{error}</p>}</div>
    </form>}

    <section aria-labelledby="work-order-list-heading">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="work-order-list-heading" className="font-semibold">Werkbonoverzicht</h2><p className="mt-1 text-sm text-slate-600">Alleen werkbonnen die je binnen deze organisatie mag zien.</p></div><span className="text-sm text-slate-500">{workOrders.length} {workOrders.length === 1 ? "werkbon" : "werkbonnen"}</span></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{workOrders.map((workOrder) => <Link key={workOrder.id} href={`/app/${companySlug}/field-service/${workOrder.id}`} className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{workOrder.title}</h3><p className="mt-1 text-sm text-slate-600">{workOrder.customerName}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{workOrderStatusLabel(workOrder.status)}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Bijgewerkt {formatWorkOrderDate(workOrder.updatedAt)}</span>{workOrder.assignedUserName && <span>Toegewezen aan {workOrder.assignedUserName}</span>}</div>{workOrder.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{workOrder.description}</p>}</Link>)}</div>
      {workOrders.length === 0 && <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">Nog geen werkbonnen. Maak de eerste werkbon hierboven aan.</div>}
    </section>
  </div>;
}
