"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { aicsEscalationLabel, aicsIntentLabel, aicsOwnershipLabel, aicsReviewLabels, type AicsEscalationState, type AicsIntent, type AicsOwnershipState, type AicsReviewStatus } from "@/features/ai-customer-service/ui";

type Draft = {
  id: string;
  body: string;
  provenance: "ai_generated" | "human_edited";
  review_status: AicsReviewStatus;
};

type Props = {
  companyId: string;
  conversationId: string;
  ownershipState?: AicsOwnershipState | null;
  escalationState?: AicsEscalationState | null;
  intent?: AicsIntent | null;
  draft?: Draft | null;
  knowledgeCount?: number;
};

type ErrorPayload = { error?: { code?: string; message?: string } };

const fallbackMessage = "De AI-klantenservice kon deze actie niet veilig uitvoeren.";

function safeError(payload: ErrorPayload) {
  switch (payload.error?.code) {
    case "AICS_NOT_AVAILABLE": return "AI-klantenservice is momenteel niet beschikbaar.";
    case "AICS_ACCESS_FORBIDDEN": return "Geen toegang tot AI-klantenservice.";
    case "AICS_HUMAN_OWNED": return "Deze aanvraag is overgedragen aan een medewerker.";
    case "AICS_DRAFT_ALREADY_REVIEWED": return "Dit antwoordconcept is al beoordeeld. De pagina wordt vernieuwd.";
    case "AICS_INVALID_TRANSITION": return "Deze statusovergang is niet toegestaan.";
    case "AICS_GENERATION_FAILED": return "Het antwoordconcept kon niet veilig worden gemaakt.";
    case "AICS_CONVERSATION_NOT_FOUND": return "Aanvraag niet gevonden.";
    default: return fallbackMessage;
  }
}

export function AicsReviewPanel({ companyId, conversationId, ownershipState, escalationState, intent, draft: initialDraft, knowledgeCount }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft ?? null);
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, setPending] = useState<"generate" | "save" | "approve" | "reject" | "takeover" | null>(null);
  const humanOwned = ownershipState === "human_owned";
  const reviewed = draft && draft.review_status !== "draft";

  async function request(path: string, options: RequestInit) {
    const response = await fetch(`/api/v1/companies/${companyId}/conversations/${conversationId}/ai-draft${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({})) as ErrorPayload;
    if (!response.ok) throw new Error(safeError(payload));
    return payload;
  }

  async function generate() {
    setPending("generate"); setError(undefined); setNotice(undefined);
    try { await request("", { method: "POST" }); router.refresh(); setNotice("Antwoordconcept is aangemaakt voor menselijke beoordeling."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : fallbackMessage); }
    finally { setPending(null); }
  }

  async function review(reviewStatus: "approved" | "rejected") {
    setPending(reviewStatus === "approved" ? "approve" : "reject"); setError(undefined); setNotice(undefined);
    try {
      await request("/review", { method: "PATCH", body: JSON.stringify({ reviewStatus, ...(body.trim() ? { body } : {}) }) });
      router.refresh();
      setNotice(reviewStatus === "approved" ? "Concept goedgekeurd. Er is geen bericht verstuurd." : "Concept afgewezen. Het blijft als historie bewaard.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : fallbackMessage); router.refresh(); }
    finally { setPending(null); }
  }

  async function saveEdit() {
    setPending("save"); setError(undefined); setNotice(undefined);
    try {
      await request("/review", { method: "PATCH", body: JSON.stringify({ reviewStatus: "draft", body }) });
      setDraft((current) => current ? { ...current, body, provenance: "human_edited" } : current);
      setNotice("Wijziging opgeslagen als concept.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : fallbackMessage); router.refresh(); }
    finally { setPending(null); }
  }

  async function takeover() {
    if (!window.confirm("Neem je dit gesprek over voor handmatige behandeling?")) return;
    setPending("takeover"); setError(undefined); setNotice(undefined);
    try { await request("/takeover", { method: "POST" }); router.refresh(); setNotice("Gesprek is overgenomen door een medewerker."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : fallbackMessage); router.refresh(); }
    finally { setPending(null); }
  }

  return <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5" aria-labelledby="aics-panel-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="aics-panel-title" className="font-semibold text-slate-950">AI-klantenservice</h2>
        <p className="mt-1 text-sm text-slate-700">AI helpt een antwoordconcept opstellen. Een medewerker beoordeelt het altijd.</p>
      </div>
      {!humanOwned && <Button type="button" onClick={generate} disabled={pending !== null}>
        {pending === "generate" ? "Concept genereren…" : draft && reviewed ? "Nieuw antwoordconcept genereren" : "Genereer antwoordconcept"}
      </Button>}
    </div>

    <div className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="AI-status">
      <span className="rounded-full border border-blue-300 bg-white px-3 py-1">Intent: {aicsIntentLabel(intent)}</span>
      <span className="rounded-full border border-blue-300 bg-white px-3 py-1">Status: {aicsOwnershipLabel(ownershipState)}</span>
      <span className="rounded-full border border-blue-300 bg-white px-3 py-1">{aicsEscalationLabel(escalationState)}</span>
    </div>

    {knowledgeCount !== undefined && knowledgeCount > 0 && <p className="mt-3 text-sm text-slate-700">Gebaseerd op {knowledgeCount} goedgekeurde kennisbron{knowledgeCount === 1 ? "" : "nen"}.</p>}
    {knowledgeCount === 0 && draft && <p className="mt-3 text-sm text-amber-800">Geen goedgekeurde kennis gevonden. Controleer het concept zorgvuldig.</p>}

    {humanOwned && <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Dit gesprek wordt handmatig behandeld. Nieuwe AI-concepten zijn uitgeschakeld.</p>}
    {!humanOwned && (escalationState === "needs_review" || escalationState === "escalated") && <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">Menselijke beoordeling vereist voor deze vraag.</p>}

    {draft && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><span className="font-semibold">{aicsReviewLabels[draft.review_status]}</span><span className="ml-2 text-sm text-slate-600">{draft.provenance === "human_edited" ? "Bewerkt door medewerker" : "Opgesteld door AI"}</span></div>
        <span className="text-xs text-slate-500">Niet verzonden</span>
      </div>
      <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="aics-draft-body">Antwoordconcept</label>
      <textarea id="aics-draft-body" className="mt-1 min-h-32 w-full rounded-md border border-slate-300 bg-white p-3 text-sm" value={body} onChange={(event) => setBody(event.target.value)} disabled={humanOwned || draft.review_status !== "draft" || pending !== null} aria-describedby="aics-draft-help" />
      <p id="aics-draft-help" className="mt-1 text-xs text-slate-600">Goedkeuren verstuurt niets. Gebruik de bestaande Core-flow voor een eventuele menselijke reactie.</p>
      {!humanOwned && draft.review_status === "draft" && <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={saveEdit} disabled={pending !== null || !body.trim()}>Wijziging opslaan</Button>
        <Button type="button" onClick={() => review("approved")} disabled={pending !== null}>{pending === "approve" ? "Goedkeuren…" : "Goedkeuren"}</Button>
        <Button type="button" variant="outline" onClick={() => review("rejected")} disabled={pending !== null}>{pending === "reject" ? "Afwijzen…" : "Afwijzen"}</Button>
      </div>}
    </div>}

    {!humanOwned && <div className="mt-4"><Button type="button" variant="outline" onClick={takeover} disabled={pending !== null}>{pending === "takeover" ? "Overnemen…" : "Gesprek handmatig overnemen"}</Button></div>}
    {!draft && !humanOwned && <p className="mt-4 text-sm text-slate-700">Nog geen AI-concept. Genereer een antwoordconcept wanneer je klaar bent om het te beoordelen.</p>}
    {notice && <p className="mt-3 text-sm text-green-800" role="status">{notice}</p>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
  </section>;
}
