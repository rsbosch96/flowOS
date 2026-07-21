"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function CreateInvoiceButton({ companyId, quoteId, companySlug }: { companyId: string; quoteId: string; companySlug: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState<string>();
  async function createInvoice() { setPending(true); setError(undefined); const response = await fetch(`/api/v1/companies/${companyId}/quotes/${quoteId}/invoice`, { method: "POST" }); const payload = await response.json() as { invoiceId?: string; error?: { message?: string } }; setPending(false); if (!response.ok || !payload.invoiceId) { setError(payload.error?.message ?? "Factuur maken mislukt."); return; } router.push(`/app/${companySlug}/invoices/${payload.invoiceId}`); }
  return <div className="space-y-2"><Button onClick={createInvoice} disabled={pending}>{pending ? "Factuur maken…" : "Maak factuur"}</Button>{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
