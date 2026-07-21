import "server-only";
import type { AiProvider, AiRequest } from "@/ai/types";
import { AiConfigurationError, AiProviderError, AiRateLimitError, AiTimeoutError, AiValidationError } from "@/ai/errors";

export class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;

  async generate<T>(request: AiRequest<T>) {
    if (process.env.AI_MODE === "mock") {
      const parsed = request.schema.safeParse({
        title: "Offerteconcept - installatiewerkzaamheden",
        summary: "Testconcept voor menselijke controle.",
        assumptions: ["Controleer materiaal en planning voor verzending."],
        customerQuestions: [],
        items: [{ description: "Werkvoorbereiding", quantity: 1, unit: "stuk" }],
      });
      if (!parsed.success) throw new AiValidationError("Mock-output voldoet niet aan schema.");
      return { data: parsed.data, provider: this.name, model: "mock", usage: {} };
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AiConfigurationError("OpenAI is niet geconfigureerd.");

    const model = request.preferredModel ?? process.env.AI_MODEL_QUOTE ?? process.env.OPENAI_QUOTE_MODEL ?? "gpt-5.2";
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: [{ role: "system", content: request.systemPrompt }, { role: "user", content: request.userPrompt }],
          text: { format: { type: "json_object" } },
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
