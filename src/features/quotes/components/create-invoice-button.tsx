"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CreateInvoiceButton({ companyId, quoteId, companySlug }: { companyId: string; quoteId: string; companySlug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [serviceDate, setServiceDate] = useState("");

  async function createInvoice() {
    if (!serviceDate) { setError("Vul een leverdatum in."); return; }
    setPending(true);
    setError(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/quotes/${quoteId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceDate }),
    });
    const payload = await response.json() as { invoiceId?: string; error?: { message?: string } };
    setPending(false);
    if (!response.ok || !payload.invoiceId) { setError(payload.error?.message ?? "Factuur maken mislukt."); return; }
    router.push(`/app/${companySlug}/invoices/${payload.invoiceId}`);
  }

  return <div className="space-y-2"><label className="block text-sm font-medium">Leverdatum<input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2" required /></label><Button onClick={createInvoice} disabled={pending || !serviceDate}>{pending ? "Factuur maken…" : "Maak factuur"}</Button>{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
