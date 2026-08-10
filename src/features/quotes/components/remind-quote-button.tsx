"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RemindQuoteButton({ companyId, quoteId }: { companyId: string; quoteId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function remind() {
    setPending(true); setMessage(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/quotes/${quoteId}/remind`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
    const data = await response.json() as { error?: { message?: string }; idempotent?: boolean };
    setPending(false);
    setMessage(response.ok ? data.idempotent ? "Deze verzendpoging was al verwerkt." : "Herinnering is verstuurd." : data.error?.message ?? "Herinnering versturen mislukt.");
  }
  return <div className="space-y-2"><Button variant="outline" onClick={remind} disabled={pending}>{pending ? "Versturen…" : "Stuur herinnering"}</Button>{message && <p className="max-w-60 text-sm text-slate-700">{message}</p>}</div>;
}
