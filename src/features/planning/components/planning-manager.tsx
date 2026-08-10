"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { planningEventStatusLabel, planningEventTypeLabel, planningEventTypes, toIsoFromLocalInput, type PlanningEventType } from "@/features/planning/domain/planning";

export type PlanningEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: PlanningEventType;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: string;
  location: string | null;
  assigned_user_id: string | null;
  customer_id: string | null;
  source_type: string;
  customer_name: string | null;
  assignee_name: string | null;
};

type Customer = { id: string; name: string };
type Member = { id: string; label: string };

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function EventFields({ value, customers, members, onChange }: {
  value: { title: string; description: string; eventType: PlanningEventType; startsAt: string; endsAt: string; allDay: boolean; location: string; assignedUserId: string; customerId?: string };
  customers: Customer[];
  members: Member[];
  onChange: (next: typeof value) => void;
}) {
  return <div className="grid gap-3 md:grid-cols-2">
    <label className="text-sm font-medium">Titel<input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={value.title} minLength={2} maxLength={160} required onChange={(event) => onChange({ ...value, title: event.target.value })} /></label>
    <label className="text-sm font-medium">Type<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={value.eventType} onChange={(event) => onChange({ ...value, eventType: event.target.value as PlanningEventType })}>{planningEventTypes.map((type) => <option key={type} value={type}>{planningEventTypeLabel(type)}</option>)}</select></label>
    {value.customerId !== undefined && <label className="text-sm font-medium">Klant<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={value.customerId} onChange={(event) => onChange({ ...value, customerId: event.target.value })}><option value="">Geen klant gekoppeld</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>}
    <label className="text-sm font-medium">Verantwoordelijke<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={value.assignedUserId} onChange={(event) => onChange({ ...value, assignedUserId: event.target.value })}><option value="">Niet toegewezen</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label>
    <label className="text-sm font-medium">Start<input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" type="datetime-local" value={value.startsAt} required onChange={(event) => onChange({ ...value, startsAt: event.target.value })} /></label>
    <label className="text-sm font-medium">Einde (optioneel)<input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" type="datetime-local" value={value.endsAt} onChange={(event) => onChange({ ...value, endsAt: event.target.value })} /></label>
    <label className="text-sm font-medium">Locatie<input className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={value.location} maxLength={240} onChange={(event) => onChange({ ...value, location: event.target.value })} /></label>
    <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" checked={value.allDay} onChange={(event) => onChange({ ...value, allDay: event.target.checked })} />Hele dag</label>
    <label className="text-sm font-medium md:col-span-2">Omschrijving<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={value.description} maxLength={4000} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label>
  </div>;
}

export function PlanningManager({ companyId, events, customers, members, canManage }: { companyId: string; events: PlanningEvent[]; customers: Customer[]; members: Member[]; canManage: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [openEventId, setOpenEventId] = useState<string>();
  const [draft, setDraft] = useState({ title: "", description: "", eventType: "appointment" as PlanningEventType, startsAt: "", endsAt: "", allDay: false, location: "", assignedUserId: "", customerId: "" });
  const [editDraft, setEditDraft] = useState<Record<string, Omit<typeof draft, "customerId">>>({});

  async function save(path: "create" | "update" | "cancel", body: Record<string, unknown>) {
    setError(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/planning-events`, { method: path === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: { message?: string } };
    if (!response.ok) { setError(data.error?.message ?? "Planning-item kon niet worden opgeslagen."); return false; }
    router.refresh();
    return true;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const startsAt = toIsoFromLocalInput(draft.startsAt); const endsAt = draft.endsAt ? toIsoFromLocalInput(draft.endsAt) : null;
    if (!startsAt || (draft.endsAt && !endsAt)) { setError("Vul een geldige start- en eindtijd in."); return; }
    setCreating(true);
    const saved = await save("create", { ...draft, startsAt, endsAt, customerId: draft.customerId || null, assignedUserId: draft.assignedUserId || null, description: draft.description || null, location: draft.location || null });
    setCreating(false);
    if (saved) setDraft({ title: "", description: "", eventType: "appointment", startsAt: "", endsAt: "", allDay: false, location: "", assignedUserId: "", customerId: "" });
  }

  function openEdit(item: PlanningEvent) {
    setOpenEventId(item.id);
    setEditDraft((current) => ({ ...current, [item.id]: { title: item.title, description: item.description ?? "", eventType: item.event_type, startsAt: toLocalInput(item.starts_at), endsAt: item.ends_at ? toLocalInput(item.ends_at) : "", allDay: item.all_day, location: item.location ?? "", assignedUserId: item.assigned_user_id ?? "" } }));
  }

  async function update(item: PlanningEvent) {
    const current = editDraft[item.id]; if (!current) return;
    const startsAt = toIsoFromLocalInput(current.startsAt); const endsAt = current.endsAt ? toIsoFromLocalInput(current.endsAt) : null;
    if (!startsAt || (current.endsAt && !endsAt)) { setError("Vul een geldige start- en eindtijd in."); return; }
    if (await save("update", { action: "update", eventId: item.id, ...current, startsAt, endsAt, assignedUserId: current.assignedUserId || null, description: current.description || null, location: current.location || null })) setOpenEventId(undefined);
  }

  async function cancel(item: PlanningEvent) {
    if (!window.confirm(`Planning-item \"${item.title}\" annuleren?`)) return;
    await save("cancel", { action: "cancel", eventId: item.id });
  }

  return <div className="space-y-6">
    {canManage ? <form onSubmit={create} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"><h2 className="font-semibold">Nieuw planning-item</h2><EventFields value={draft} customers={customers} members={members} onChange={(next) => setDraft(next as typeof draft)} /><Button disabled={creating}>{creating ? "Opslaan…" : "Aan planning toevoegen"}</Button></form> : <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Je kunt de planning bekijken. Alleen een eigenaar of medewerker kan items aanpassen.</p>}
    {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    <div className="divide-y rounded-lg border border-slate-200 bg-white"><div className="p-4"><h2 className="font-semibold">Komende planning</h2><p className="mt-1 text-sm text-slate-600">Afspraken, werk en leveringen voor deze organisatie.</p></div>{events.map((item) => <div className="p-4" key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-slate-600">{new Date(item.starts_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: item.all_day ? undefined : "short" })} · {planningEventTypeLabel(item.event_type)} · {planningEventStatusLabel(item.status)}</p>{item.customer_name && <p className="mt-1 text-sm text-slate-600">Klant: {item.customer_name}</p>}{item.assignee_name && <p className="mt-1 text-sm text-slate-600">Verantwoordelijke: {item.assignee_name}</p>}{item.location && <p className="mt-1 text-sm text-slate-600">Locatie: {item.location}</p>}</div>{canManage && item.status === "scheduled" && <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => openEventId === item.id ? setOpenEventId(undefined) : openEdit(item)}>Bewerken</Button><Button type="button" variant="outline" onClick={() => cancel(item)}>Annuleren</Button></div>}</div>{openEventId === item.id && editDraft[item.id] && <div className="mt-4 border-t pt-4"><EventFields value={editDraft[item.id]} customers={[]} members={members} onChange={(next) => setEditDraft((current) => ({ ...current, [item.id]: next }))} /><div className="mt-3 flex gap-2"><Button type="button" onClick={() => update(item)}>Wijzigingen opslaan</Button><Button type="button" variant="outline" onClick={() => setOpenEventId(undefined)}>Sluiten</Button></div></div>}</div>)}{events.length === 0 && <p className="p-8 text-sm text-slate-600">Nog geen planning-items. Voeg hierboven de eerste afspraak of werkzaamheden toe.</p>}</div>
  </div>;
}
