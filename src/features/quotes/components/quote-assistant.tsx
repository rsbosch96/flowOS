"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTranslations } from "@/i18n/get-translations";

type QuoteGenerationErrorCode =
  | "AI_CONFIGURATION_REQUIRED"
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_VALIDATION_FAILED"
  | "QUOTE_STORAGE_FAILED"
  | "AI_RUN_UNAVAILABLE"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_GENERATION_FAILED";

function errorMessage(code: QuoteGenerationErrorCode | undefined) {
  const { t } = getTranslations();
  const keyByCode = {
    AI_CONFIGURATION_REQUIRED: "aiQuote.configurationRequired",
    AI_RATE_LIMIT: "aiQuote.rateLimit",
    AI_TIMEOUT: "aiQuote.timeout",
    AI_VALIDATION_FAILED: "aiQuote.validationFailed",
    QUOTE_STORAGE_FAILED: "aiQuote.storageFailed",
    AI_RUN_UNAVAILABLE: "aiQuote.runUnavailable",
    AI_PROVIDER_UNAVAILABLE: "aiQuote.providerUnavailable",
    AI_GENERATION_FAILED: "aiQuote.genericFailure",
  } as const;
  return t(code ? keyByCode[code] : "aiQuote.genericFailure");
}

export function QuoteAssistant({ companyId, companySlug }: { companyId: string; companySlug: string }) {
  const router = useRouter();
  const { t } = getTranslations();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/companies/${companyId}/quotes/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: formData.get("customerName"),
          customerEmail: formData.get("customerEmail"),
          requestText: formData.get("requestText"),
        }),
      });
      const payload = await response.json() as { quoteId?: string; error?: { code?: QuoteGenerationErrorCode; message?: string } };
      if (!response.ok || !payload.quoteId) {
        setError(errorMessage(payload.error?.code));
        return;
      }
      router.replace(`/app/${companySlug}/quotes/${payload.quoteId}`);
      router.refresh();
    } catch {
      setError(t("aiQuote.networkFailure"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-blue-100 p-2 text-blue-700"><Bot size={20} /></div>
        <div>
          <h1 className="text-xl font-semibold">AI Offerte Assistent</h1>
          <p className="mt-1 text-sm text-slate-600">De AI maakt een concept; controleer altijd scope, prijzen en aannames voordat je verstuurt.</p>
        </div>
      </div>
      <form action={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Klantnaam<input name="customerName" required className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label>
          <label className="text-sm font-medium">E-mail (optioneel)<input name="customerEmail" type="email" className="mt-1 w-full rounded-md border bg-white px-3 py-2" /></label>
        </div>
        <label className="block text-sm font-medium">Aanvraag<input name="requestText" required minLength={20} className="mt-1 min-h-48 w-full rounded-md border bg-white px-3 py-2" placeholder="Bijvoorbeeld: vervang cv-ketel, woningtype, gewenste werkzaamheden, beschikbare materialen en bekende prijzen…" /></label>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Concept wordt gemaakt…" : "Genereer offerteconcept"}</Button>
      </form>
    </Card>
  );
}
