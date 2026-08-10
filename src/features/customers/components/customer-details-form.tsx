"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

export type CustomerDetails = {
  id: string;
  name: string;
  email: string | null;
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

export function CustomerDetailsForm({ companyId, customer }: { companyId: string; customer: CustomerDetails }) {
  const [state, setState] = useState(customer);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  function set<K extends keyof CustomerDetails>(key: K, value: CustomerDetails[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/v1/companies/${companyId}/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          email: state.email ?? "",
          street: state.street,
          postalCode: state.postalCode,
          city: state.city,
          country: state.country,
        }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      setMessage(response.ok ? "Klantgegevens opgeslagen." : (payload.error?.message ?? "Klantgegevens konden niet worden opgeslagen."));
    } catch {
      setMessage("Klantgegevens konden niet worden opgeslagen.");
    } finally {
      setPending(false);
    }
  }

  return <form onSubmit={save} className="mt-4 space-y-4">
    <p className="text-sm text-slate-600">Vul deze gegevens aan voordat je een factuur maakt. E-mail is optioneel.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Klantnaam" value={state.name} required onChange={(value) => set("name", value)} />
      <Field label="E-mail" value={state.email ?? ""} type="email" onChange={(value) => set("email", value || null)} />
      <Field label="Straat en huisnummer" value={state.street} required onChange={(value) => set("street", value)} />
      <Field label="Postcode" value={state.postalCode} required onChange={(value) => set("postalCode", value)} />
      <Field label="Plaats" value={state.city} required onChange={(value) => set("city", value)} />
      <Field label="Land" value={state.country} required onChange={(value) => set("country", value)} />
    </div>
    <div className="flex items-center gap-3">
      <Button disabled={pending}>{pending ? "Opslaan…" : "Klantgegevens opslaan"}</Button>
      {message && <p role="status" className={message === "Klantgegevens opgeslagen." ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{message}</p>}
    </div>
  </form>;
}

function Field({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="text-sm font-medium">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2" /></label>;
}
