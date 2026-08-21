"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { evidenceTypeLabels, formatWorkOrderDate, workOrderStatusLabel } from "@/features/field-service/presentation";

type Member = { id: string; role: string; label: string };
type Product = { id: string; name: string; sku: string | null; unit: string };

export type WorkOrderDetailData = {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  quoteId: string | null;
  quote: { number: string; title: string; status: string; totalCents: number } | null;
  planningEventId: string | null;
  planningEvent: { title: string; startsAt: string } | null;
  assignedUserId: string | null;
  title: string;
  description: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Material = { id: string; sourceKind: string; productName: string | null; sku: string | null; description: string | null; unit: string | null; quantity: number; createdAt: string };
type Note = { id: string; body: string; created_by: string; created_at: string };
type Evidence = { id: string; evidenceType: keyof typeof evidenceTypeLabels; filename: string; mimeType: string; createdAt: string };
type Signoff = { id: string; customerName: string; confirmationMethod: string; createdAt: string };

const inputClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

function euro(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function WorkOrderDetail({ companyId, workOrder, currentUserId, currentUserRole, members, products, materials, notes, evidence, signoff }: {
  companyId: string;
  workOrder: WorkOrderDetailData;
  currentUserId: string;
  currentUserRole: string;
  members: Member[];
  products: Product[];
  materials: Material[];
  notes: Note[];
  evidence: Evidence[];
  signoff: Signoff | null;
}) {
  const router = useRouter();
  const canManage = currentUserRole === "owner" || currentUserRole === "employee";
  const canExecute = canManage || (currentUserRole === "technician" && workOrder.assignedUserId === currentUserId);
  const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [assignedUserId, setAssignedUserId] = useState(workOrder.assignedUserId ?? "");
  const [material, setMaterial] = useState({ sourceKind: "catalog" as "catalog" | "external", productId: "", description: "", unit: "", quantity: "1", externalReason: "" });
  const [noteBody, setNoteBody] = useState("");
  const [signoffForm, setSignoffForm] = useState({ customerName: workOrder.customerName, confirmationMethod: "verbal" as "verbal" | "checkbox" });

  async function post(path: string, body: Record<string, unknown>, key: string) {
    setPending(key);
    setError(undefined);
    setMessage(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/field-service/work-orders/${workOrder.id}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { error?: { message?: string } };
    setPending(undefined);
    if (!response.ok) { setError(payload.error?.message ?? "De werkbonactie kon niet worden uitgevoerd."); return false; }
    setMessage("Werkbon bijgewerkt.");
    router.refresh();
    return true;
  }

  async function assign() {
    await post(`/assign`, { assignedUserId: assignedUserId || null }, "assign");
  }

  async function transition(action: "dispatch" | "start" | "complete" | "cancel") {
    if (action === "cancel" && !window.confirm("Deze werkbon annuleren? Dit is een auditbare eindstatus.")) return;
    await post(`/${action}`, {}, action);
  }

  async function addMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await post("/materials", { sourceKind: material.sourceKind, productId: material.sourceKind === "catalog" ? material.productId || null : null, description: material.sourceKind === "external" ? material.description || null : null, unit: material.sourceKind === "external" ? material.unit || null : null, quantity: Number(material.quantity), externalReason: material.sourceKind === "external" ? material.externalReason || null : null }, "material");
    if (ok) setMaterial({ sourceKind: "catalog", productId: "", description: "", unit: "", quantity: "1", externalReason: "" });
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noteBody.trim()) return;
    const ok = await post("/notes", { body: noteBody }, "note");
    if (ok) setNoteBody("");
  }

  async function addSignoff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await post("/signoff", { customerName: signoffForm.customerName, confirmationMethod: signoffForm.confirmationMethod, signatureDocumentId: null }, "signoff");
  }

  async function uploadEvidence(file: File) {
    setPending("evidence");
    setError(undefined);
    setMessage(undefined);
    const prepare = await fetch(`/api/v1/companies/${companyId}/field-service/work-orders/${workOrder.id}/evidence/upload-url`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, mimeType: file.type, byteSize: file.size }) });
    const prepared = await prepare.json() as { documentId?: string; signedUrl?: string; token?: string; error?: { message?: string } };
    if (!prepare.ok || !prepared.documentId || !prepared.signedUrl || !prepared.token) { setPending(undefined); setError(prepared.error?.message ?? "Upload kon niet worden voorbereid."); return; }
    const upload = await fetch(prepared.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!upload.ok) { setPending(undefined); setError("Het bestand kon niet veilig worden geüpload."); return; }
    const recorded = await post("/evidence", { documentId: prepared.documentId, evidenceType: file.type.startsWith("image/") ? "photo" : "document" }, "evidence");
    if (recorded) setMessage("Bewijsmateriaal toegevoegd.");
    setPending(undefined);
  }

  const transitionButtons = workOrder.status === "planned" ? [{ action: "dispatch" as const, label: "Verstuur naar uitvoering", enabled: canManage && Boolean(workOrder.assignedUserId) }, { action: "cancel" as const, label: "Annuleren", enabled: canManage }] : workOrder.status === "dispatched" ? [{ action: "start" as const, label: "Start uitvoering", enabled: canExecute }, { action: "cancel" as const, label: "Annuleren", enabled: canManage }] : workOrder.status === "in_progress" ? [{ action: "complete" as const, label: "Markeer als afgerond", enabled: canExecute }, { action: "cancel" as const, label: "Annuleren", enabled: canManage }] : [];

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-sm font-medium text-blue-700">Werkbon</p><h1 className="mt-1 text-2xl font-semibold">{workOrder.title}</h1><p className="mt-1 text-sm text-slate-600">{workOrder.customerName} · bijgewerkt {formatWorkOrderDate(workOrder.updatedAt)}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">{workOrderStatusLabel(workOrder.status)}</span>{transitionButtons.map((button) => <Button key={button.action} type="button" variant={button.action === "cancel" ? "outline" : "default"} disabled={!button.enabled || Boolean(pending)} onClick={() => transition(button.action)}>{pending === button.action ? "Bezig…" : button.label}</Button>)}</div>
    </header>
    {(message || error) && <p className={error ? "text-sm text-red-700" : "text-sm text-emerald-700"} role="status">{error ?? message}</p>}

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><h2 className="font-semibold">Overzicht</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Klant</dt><dd className="mt-1 text-sm">{workOrder.customerName}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Aangemaakt</dt><dd className="mt-1 text-sm">{formatWorkOrderDate(workOrder.createdAt)}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Start uitvoering</dt><dd className="mt-1 text-sm">{formatWorkOrderDate(workOrder.startedAt)}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Afgerond/geannuleerd</dt><dd className="mt-1 text-sm">{formatWorkOrderDate(workOrder.completedAt ?? workOrder.cancelledAt)}</dd></div></dl>{workOrder.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{workOrder.description}</p>}</section>
        {workOrder.quote && <section className="rounded-lg border border-blue-100 bg-blue-50 p-4 sm:p-5"><h2 className="font-semibold">Offertecontext</h2><p className="mt-1 text-sm text-slate-700">{workOrder.quote.number} · {workOrder.quote.title}</p><p className="mt-2 text-sm text-slate-700">Status: {workOrder.quote.status === "accepted" ? "Geaccepteerd" : workOrder.quote.status} · Totaal: {euro(workOrder.quote.totalCents)}</p><p className="mt-2 text-xs text-slate-600">Deze werkbon leest de offerte als bronverwijzing. Bedragen en status worden door Field Service niet gewijzigd.</p></section>}
        {workOrder.planningEvent && <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5"><h2 className="font-semibold">Planningcontext</h2><p className="mt-1 text-sm text-slate-700">{workOrder.planningEvent.title}</p><p className="mt-1 text-sm text-slate-600">{formatWorkOrderDate(workOrder.planningEvent.startsAt)}</p></section>}
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Materialen</h2><span className="text-sm text-slate-500">{materials.length}</span></div>{materials.length > 0 && <div className="mt-4 divide-y rounded-md border border-slate-200">{materials.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{item.productName ?? item.description ?? "Materiaal"}</p><p className="text-slate-600">{item.quantity} {item.unit ?? "stuks"}{item.sku ? ` · ${item.sku}` : ""}</p></div><span className="text-xs text-slate-500">{item.sourceKind === "catalog" ? "Catalogus" : "Extern"}</span></div>)}</div>}{canExecute && (workOrder.status === "planned" || workOrder.status === "dispatched" || workOrder.status === "in_progress") && <form onSubmit={addMaterial} className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2"><label className="text-sm font-medium">Bron<select className={inputClass} value={material.sourceKind} onChange={(event) => setMaterial({ ...material, sourceKind: event.target.value as "catalog" | "external", productId: "" })}><option value="catalog">Bestaande catalogus</option><option value="external">Extern materiaal</option></select></label>{material.sourceKind === "catalog" ? <label className="text-sm font-medium">Product<select className={inputClass} required value={material.productId} onChange={(event) => setMaterial({ ...material, productId: event.target.value })}><option value="">Kies product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label> : <><label className="text-sm font-medium">Omschrijving<input className={inputClass} required value={material.description} onChange={(event) => setMaterial({ ...material, description: event.target.value })} /></label><label className="text-sm font-medium">Eenheid<input className={inputClass} required value={material.unit} onChange={(event) => setMaterial({ ...material, unit: event.target.value })} /></label><label className="text-sm font-medium sm:col-span-2">Reden<input className={inputClass} required value={material.externalReason} onChange={(event) => setMaterial({ ...material, externalReason: event.target.value })} /></label></>}<label className="text-sm font-medium">Aantal<input className={inputClass} type="number" min="0.001" step="0.001" required value={material.quantity} onChange={(event) => setMaterial({ ...material, quantity: event.target.value })} /></label><div className="flex items-end"><Button disabled={pending === "material"}>{pending === "material" ? "Toevoegen…" : "Materiaal toevoegen"}</Button></div></form>}</section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Interne notities</h2><span className="text-sm text-slate-500">{notes.length}</span></div>{notes.length > 0 && <div className="mt-4 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-md bg-slate-50 p-3"><p className="whitespace-pre-wrap text-sm">{note.body}</p><p className="mt-2 text-xs text-slate-500">{formatWorkOrderDate(note.created_at)}</p></article>)}</div>}{canExecute && (workOrder.status === "planned" || workOrder.status === "dispatched" || workOrder.status === "in_progress") && <form onSubmit={addNote} className="mt-4 space-y-3"><label className="text-sm font-medium">Nieuwe notitie<textarea className={`${inputClass} min-h-24`} value={noteBody} maxLength={10000} onChange={(event) => setNoteBody(event.target.value)} /></label><Button disabled={pending === "note" || !noteBody.trim()}>{pending === "note" ? "Opslaan…" : "Notitie toevoegen"}</Button></form>}</section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Foto&apos;s en bewijs</h2><span className="text-sm text-slate-500">{evidence.length}</span></div>{evidence.length > 0 && <div className="mt-4 divide-y rounded-md border border-slate-200">{evidence.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{item.filename}</p><p className="text-xs text-slate-500">{evidenceTypeLabels[item.evidenceType] ?? "Bewijs"} · {formatWorkOrderDate(item.createdAt)}</p></div><span className="text-xs text-slate-500">Opgeslagen</span></div>)}</div>}{canExecute && (workOrder.status === "dispatched" || workOrder.status === "in_progress") && <label className="mt-4 inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">{pending === "evidence" ? "Upload voorbereiden…" : "Foto of document toevoegen"}<input type="file" className="sr-only" accept="image/jpeg,image/png,application/pdf,text/plain" disabled={Boolean(pending)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(file); event.currentTarget.value = ""; }} /></label>}</section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Opleverbevestiging</h2>{signoff && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Vastgelegd</span>}</div>{signoff ? <p className="mt-3 text-sm text-slate-700">{signoff.customerName} · {signoff.confirmationMethod === "checkbox" ? "Checkbox" : "Mondeling"} · {formatWorkOrderDate(signoff.createdAt)}</p> : canExecute && workOrder.status === "in_progress" ? <form onSubmit={addSignoff} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Naam klant<input className={inputClass} required value={signoffForm.customerName} onChange={(event) => setSignoffForm({ ...signoffForm, customerName: event.target.value })} /></label><label className="text-sm font-medium">Bevestigingsmethode<select className={inputClass} value={signoffForm.confirmationMethod} onChange={(event) => setSignoffForm({ ...signoffForm, confirmationMethod: event.target.value as "verbal" | "checkbox" })}><option value="verbal">Mondeling</option><option value="checkbox">Checkbox</option></select></label><div className="sm:col-span-2"><Button disabled={pending === "signoff"}>{pending === "signoff" ? "Vastleggen…" : "Opleverbevestiging vastleggen"}</Button></div></form> : <p className="mt-3 text-sm text-slate-600">De opleverbevestiging wordt beschikbaar zodra de uitvoering is gestart.</p>}</section>
      </div>
      <aside className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5"><h2 className="font-semibold">Verantwoordelijke</h2><p className="mt-1 text-sm text-slate-600">Toewijzing blijft server-side tenant- en rolgevalideerd.</p>{canManage ? <div className="mt-4 space-y-3"><select className={inputClass} value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}><option value="">Niet toegewezen</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label} · {member.role}</option>)}</select><Button type="button" variant="outline" disabled={pending === "assign" || assignedUserId === (workOrder.assignedUserId ?? "")} onClick={assign}>{pending === "assign" ? "Opslaan…" : "Toewijzing opslaan"}</Button></div> : <p className="mt-4 text-sm font-medium">{members.find((member) => member.id === workOrder.assignedUserId)?.label ?? "Nog niet toegewezen"}</p>}</section>
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"><h2 className="font-semibold">Veilige workflow</h2><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>• Statusovergangen worden door bestaande RPC&apos;s bepaald.</li><li>• Materialen zijn snapshots; prijzen en btw horen niet bij Field Service.</li><li>• Foto&apos;s gebruiken tenantgebonden signed uploads.</li><li>• Annuleren en oplevering worden auditbaar vastgelegd.</li></ul></section>
      </aside>
    </div>
  </div>;
}
