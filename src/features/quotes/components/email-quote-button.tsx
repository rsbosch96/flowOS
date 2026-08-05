"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EmailQuoteButton({ companyId, quoteId }: { companyId: string; quoteId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function send() {
    setPending(true); setMessage(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/quotes/${quoteId}/email`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
    const data = await response.json() as { error?: { message?: string }; idempotent?: boolean };
    setPending(false);
    if (!response.ok) { setMessage(data.error?.message ?? "E-mail versturen mislukt."); return; }
    setMessage(data.idempotent ? "Deze verzendpoging was al verwerkt." : "Offerte is per e-mail verstuurd.");
    router.refresh();
  }
  return <div className="space-y-2"><Button onClick={send} disabled={pending} variant="secondary">{pending ? "Versturen…" : "E-mail klant"}</Button>{message && <p className="max-w-52 text-sm text-slate-700">{message}</p>}</div>;
}
