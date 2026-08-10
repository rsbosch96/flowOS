"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type GenerateQuoteResponse = { quoteId?: string; error?: { code?: string } };

export function ConversationActions({
  companyId,
  companySlug,
  conversationId,
  status,
  canGenerateQuote,
}: {
  companyId: string;
  companySlug: string;
  conversationId: string;
  status: string;
  canGenerateQuote: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [generatingQuote, setGeneratingQuote] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/conversations/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, direction: "internal" }),
    });
    if (!response.ok) {
      setError("Notitie opslaan mislukt.");
      return;
    }
    setBody("");
    router.refresh();
  }

  async function resolve() {
    setError(undefined);
    const response = await fetch(`/api/v1/companies/${companyId}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "resolved" ? "open" : "resolved" }),
    });
    if (!response.ok) setError("Status aanpassen mislukt.");
    else router.refresh();
  }

  async function generateQuote() {
    setGeneratingQuote(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/companies/${companyId}/quotes/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const payload = await response.json() as GenerateQuoteResponse;
      if (!response.ok || !payload.quoteId) {
        setError("Offerteconcept kon niet worden gemaakt. Controleer de aanvraag en catalogus.");
        return;
      }
      router.push(`/app/${companySlug}/quotes/${payload.quoteId}`);
      router.refresh();
    } catch {
      setError("Offerteconcept kon niet worden gemaakt. Probeer het opnieuw.");
    } finally {
      setGeneratingQuote(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {canGenerateQuote && (
        <Button type="button" onClick={generateQuote} disabled={generatingQuote}>
          {generatingQuote ? "Concept wordt gemaakt…" : "Conceptofferte genereren"}
        </Button>
      )}
      <form onSubmit={add}>
        <textarea className="min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Interne notitie toevoegen" required minLength={2} />
        <Button className="mt-2">Notitie opslaan</Button>
      </form>
      <Button variant="outline" onClick={resolve}>{status === "resolved" ? "Heropen aanvraag" : "Markeer als afgehandeld"}</Button>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
