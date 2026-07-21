"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ApproveQuoteButton({ companyId, quoteId }: { companyId: string; quoteId: string }) {
  const router = useRouter(); const [error, setError] = useState<string>(); const [pending, setPending] = useState(false);
  async function approve() { setPending(true); setError(undefined); const response = await fetch(`/api/v1/companies/${companyId}/quotes/${quoteId}/approve`, { method: "POST" }); if (!response.ok) { const payload = await response.json() as { error?: { message?: string } }; setError(payload.error?.message ?? "Goedkeuren mislukt."); setPending(false); return; } router.refresh(); }
  return <div className="space-y-2"><Button onClick={approve} disabled={pending}>{pending ? "Bezig…" : "Offerte goedkeuren"}</Button>{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
