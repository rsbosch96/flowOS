"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toIsoFromLocalInput } from "@/features/planning/domain/planning";

export function AddQuoteToPlanningButton({ companyId, companySlug, quoteId, quoteNumber, quoteTitle }: { companyId: string; companySlug: string; quoteId: string; quoteNumber: string; quoteTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [title, setTitle] = useState(`Werkzaamheden ${quoteNumber}${quoteTitle ? ` — ${quoteTitle}` : ""}`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function create() {
    const start = toIsoFromLocalInput(startsAt);
    if (!start) { setError("Kies een geldige datum en tijd."); return; }
    setPending(true); setError(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/planning-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId, title, eventType: "work", startsAt: start, allDay: false }) });
    const data = await response.json() as { error?: { message?: string } };
    setPending(false);
    if (!response.ok) { setError(data.error?.message ?? "Planning-item kon niet worden opgeslagen."); return; }
    router.push(`/app/${companySlug}/planning`);
  }

  return <div className="mt-3 space-y-2"><Button type="button" variant="outline" onClick={() => setOpen((value) => !value)}>Toevoegen aan planning</Button>{open && <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-left"><p className="text-sm text-slate-600">Klant en geaccepteerde offerte worden veilig server-side gekoppeld. Kies alleen het uitvoeringsmoment.</p><label className="block text-sm font-medium">Titel<input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={160} /></label><label className="block text-sm font-medium">Start<input className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label><Button type="button" onClick={create} disabled={pending}>{pending ? "Opslaan…" : "Planning-item maken"}</Button>{error && <p className="text-sm text-red-600" role="alert">{error}</p>}</div>}</div>;
}
