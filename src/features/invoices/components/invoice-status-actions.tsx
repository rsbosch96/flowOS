"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { availableInvoiceStatusActions, invoiceStatusLabel, type InvoiceStatusAction } from "@/lib/status-labels";

const actionLabels: Record<InvoiceStatusAction, string> = {
  sent: "Markeer als verzonden",
  paid: "Markeer als betaald",
  void: "Factuur annuleren",
};

export function InvoiceStatusActions({ companyId, invoiceId, status, canManage }: { companyId: string; invoiceId: string; status: string; canManage: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<InvoiceStatusAction>();
  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [message, setMessage] = useState<string>();
  const actions = availableInvoiceStatusActions(status);

  if (!canManage) return null;

  async function transition(targetStatus: InvoiceStatusAction) {
    if (targetStatus === "void" && voidReason.trim().length < 2) {
      setMessage("Geef een reden op voor het annuleren.");
      return;
    }
    setPending(targetStatus);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/v1/companies/${companyId}/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, voidReason: targetStatus === "void" ? voidReason : undefined }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "Factuurstatus kon niet worden gewijzigd.");
        return;
      }
      setMessage(`Factuur is ${invoiceStatusLabel(targetStatus).toLowerCase()}.`);
      setVoidMode(false);
      router.refresh();
    } catch {
      setMessage("Factuurstatus kon niet worden gewijzigd.");
    } finally {
      setPending(undefined);
    }
  }

  return <div className="mt-4 space-y-3">
    {actions.length > 0 && <div className="flex flex-wrap gap-2">
      {actions.filter((action) => action !== "void").map((action) => <Button key={action} type="button" variant="outline" disabled={Boolean(pending)} onClick={() => transition(action)}>{pending === action ? "Opslaan…" : actionLabels[action]}</Button>)}
      {actions.includes("void") && <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => { setVoidMode((current) => !current); setMessage(undefined); }}>Factuur annuleren</Button>}
    </div>}
    {voidMode && <div className="max-w-lg rounded-md border border-amber-200 bg-amber-50 p-3">
      <label className="block text-sm font-medium">Reden voor annuleren<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} minLength={2} maxLength={1000} className="mt-1 block min-h-20 w-full rounded-md border border-slate-300 bg-white p-2" /></label>
      <div className="mt-3 flex gap-2"><Button type="button" disabled={Boolean(pending)} onClick={() => transition("void")}>{pending === "void" ? "Annuleren…" : "Bevestig annuleren"}</Button><Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => setVoidMode(false)}>Terug</Button></div>
    </div>}
    {message && <p role="status" className={message.startsWith("Factuur is") ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{message}</p>}
  </div>;
}
