import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiRunError } from "@/ai/errors";
import { executeAiRun, type AiRunRepository } from "@/ai/gateway-core";
import { OpenAiProvider } from "@/ai/providers/openai-provider";
import type { AiPersistence, AiRequest, AiResult } from "@/ai/types";

function aiRunKind(feature: AiRequest<unknown>["feature"]) {
  if (feature === "quote_generation") return "quote_generation";
  if (feature === "document_extraction") return "document_extraction";
  return "reply_draft";
}

function safeMetadata(metadata: AiRequest<unknown>["metadata"]): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key, value]) =>
    !/(prompt|document|content|text|email|name)/i.test(key)
    && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
  ).slice(0, 20));
}

function requestedModel(request: AiRequest<unknown>) {
  return request.preferredModel ?? process.env.AI_MODEL_QUOTE ?? process.env.OPENAI_QUOTE_MODEL ?? null;
}

async function createRunRepository(): Promise<AiRunRepository> {
  const supabase = createAdminClient();

  return {
    async start(request) {
      const { data, error } = await supabase.rpc("start_ai_run", {
        target_company_id: request.companyId,
        target_initiated_by: request.userId,
        requested_kind: aiRunKind(request.feature),
        requested_prompt_version: "quote-gateway-v1",
        requested_metadata: safeMetadata(request.metadata),
        requested_provider: "openai",
        requested_model: requestedModel(request),
      });
      if (error || !data) throw new AiRunError("AI-run kon niet worden gestart.");
      return data as string;
    },
    async finish(input) {
      const { error } = await supabase.rpc("finish_ai_run", {
        target_run_id: input.runId,
        new_status: input.status,
        target_quote_id: input.quoteId ?? null,
        provider_name: input.provider ?? "openai",
        provider_model: input.model ?? null,
        provider_input_tokens: input.inputTokens ?? null,
        provider_output_tokens: input.outputTokens ?? null,
        provider_total_tokens: input.totalTokens ?? null,
        provider_duration_ms: input.durationMs,
        provider_estimated_cost_cents: input.estimatedCostCents ?? null,
        cost_currency: input.currency,
        failure_code: input.errorCode ?? null,
        safe_error_message: input.status === "failed" ? "AI-generatie is mislukt." : null,
      });
      if (error) throw new AiRunError("AI-run kon niet worden afgerond.");
    },
  };
}

export async function runAi<T>(request: AiRequest<T>, persist?: AiPersistence<T>): Promise<AiResult<T>> {
  if ((process.env.AI_PROVIDER ?? "openai") !== "openai") throw new AiRunError("Niet-ondersteunde AI-provider.");
  return executeAiRun(request, { provider: new OpenAiProvider(), runs: await createRunRepository() }, persist);
}
