import "server-only";
import type { AiProvider, AiRequest } from "@/ai/types";
import { AiConfigurationError, AiProviderError, AiRateLimitError, AiTimeoutError, AiValidationError } from "@/ai/errors";
import { assertRc1InputLimit, getRc1SpikeConfig } from "@/ai/rc1-spike";
import { createDeterministicMockReply, classifySupportIntent, type SupportIntent } from "@/ai/customer-service";

function mockCatalogItemName(userPrompt: string) {
  const catalog = userPrompt.split("Beschikbare catalogusproducten (zonder prijzen):\n")[1]?.split("\n\n")[0];
  const firstItem = catalog?.split("\n").map((line) => line.trim()).find(Boolean);
  if (!firstItem || firstItem === "Geen catalogusproducten beschikbaar.") return "Werkvoorbereiding";

  const unitSeparator = firstItem.lastIndexOf(":");
  const nameWithSku = unitSeparator > 0 ? firstItem.slice(0, unitSeparator) : firstItem;
  return nameWithSku.replace(/\s+\([^()]*\)$/, "").trim() || "Werkvoorbereiding";
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;

  async generate<T>(request: AiRequest<T>) {
    if (process.env.AI_MODE === "mock") {
      // Local-only deterministic failure hook for runtime proof. It is never
      // enabled by default, is unavailable on Vercel, and requires the
      // reserved synthetic marker in addition to the explicit harness flag.
      if (process.env.AICS_LOCAL_RUNTIME_PROOF === "1"
        && process.env.VERCEL !== "1"
        && request.userPrompt.includes("[AICS_TEST_PROVIDER_FAILURE]")) {
        throw new AiProviderError("AICS_TEST_PROVIDER_FAILURE");
      }
      if (request.feature === "support_reply") {
        // The server has already classified the canonical Core message. Never
        // reclassify the policy/prompt envelope, which could contain unrelated
        // words and make a mock result unstable.
        const requestedIntent = request.metadata?.intent;
        const intent: SupportIntent = typeof requestedIntent === "string"
          ? requestedIntent as SupportIntent
          : classifySupportIntent(request.userPrompt);
        const parsedSupport = request.schema.safeParse(createDeterministicMockReply(intent));
        if (!parsedSupport.success) throw new AiValidationError("Mock-klantserviceantwoord voldoet niet aan schema.");
        return { data: parsedSupport.data, provider: this.name, model: "mock", usage: {} };
      }
      const catalogItemName = mockCatalogItemName(request.userPrompt);
      const parsed = request.schema.safeParse({
        title: "Offerteconcept - installatiewerkzaamheden",
        summary: "Testconcept voor menselijke controle.",
        assumptions: ["Controleer materiaal en planning voor verzending."],
        customerQuestions: [],
        items: [{ description: catalogItemName, catalogItemName, quantity: 1, unit: "stuk" }],
      });
      if (!parsed.success) throw new AiValidationError("Mock-output voldoet niet aan schema.");
      return { data: parsed.data, provider: this.name, model: "mock", usage: {} };
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AiConfigurationError("OpenAI is niet geconfigureerd.");

    const model = request.preferredModel ?? process.env.AI_MODEL_QUOTE ?? process.env.OPENAI_QUOTE_MODEL ?? "gpt-5.2";
    const rc1Config = getRc1SpikeConfig(model);
    if (rc1Config) assertRc1InputLimit(request.systemPrompt, request.userPrompt, rc1Config);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: [{ role: "system", content: request.systemPrompt }, { role: "user", content: request.userPrompt }],
          text: { format: { type: "json_object" } },
          ...(rc1Config ? { max_output_tokens: rc1Config.maxOutputTokens } : {}),
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") throw new AiTimeoutError("AI-aanroep duurde te lang.");
      throw new AiProviderError("AI-provider niet bereikbaar.");
    }

    if (response.status === 429) throw new AiRateLimitError("AI-limiet bereikt.");
    if (!response.ok) throw new AiProviderError(`Providerfout ${response.status}`);

    const body = await response.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    try {
      const parsed = request.schema.safeParse(JSON.parse(body.output_text ?? ""));
      if (!parsed.success) throw new AiValidationError("AI-uitvoer voldoet niet aan schema.");
      return {
        data: parsed.data,
        provider: this.name,
        model,
        usage: {
          inputTokens: body.usage?.input_tokens,
          outputTokens: body.usage?.output_tokens,
          totalTokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
        },
      };
    } catch (error) {
      if (error instanceof AiValidationError) throw error;
      throw new AiValidationError("AI gaf geen geldige JSON terug.");
    }
  }
}
