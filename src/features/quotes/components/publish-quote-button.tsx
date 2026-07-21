"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function PublishQuoteButton({ companyId, quoteId }: { companyId: string; quoteId: string }) {
  const [pending, setPending] = useState(false); const [url, setUrl] = useState<string>(); const [error, setError] = useState<string>();
  async function publish() { setPending(true); setError(undefined); const response = await fetch(`/api/v1/companies/${companyId}/quotes/${quoteId}/publish`, { method: "POST" }); const payload = await response.json() as { url?: string; error?: { message?: string } }; setPending(false); if (!response.ok || !payload.url) { setError(payload.error?.message ?? "Klantlink maken mislukt."); return; } setUrl(payload.url); }
  return <div className="space-y-2"><Button onClick={publish} disabled={pending}>{pending ? "Link maken…" : "Verstuur klantlink"}</Button>{url && <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900"><p>De klantlink is klaar.</p><Button className="mt-2" variant="outline" onClick={() => navigator.clipboard.writeText(url)}>Kopieer link</Button> <a className="ml-3 underline" href={url} target="_blank">Open offerte</a></div>}{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
