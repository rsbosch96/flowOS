import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiRunError } from "@/ai/errors";
import { executeAiRun, type AiRunRepository } from "@/ai/gateway-core";
import { OpenAiProvider } from "@/ai/providers/openai-provider";
import { assertRc1AttemptAllowed, assertRc1InputLimit, getRc1SpikeConfig, rc1SpikeMetadata, type Rc1SpikeConfig } from "@/ai/rc1-spike";
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
  return request.preferredModel ?? process.env.AI_MODEL_QUOTE ?? process.env.OPENAI_QUOTE_MODEL ?? "gpt-5.2";
}

type Rc1ReservationRepository = AiRunRepository & {
  reserveRc1ProviderCall(input: { runId: string; request: AiRequest<unknown>; config: Rc1SpikeConfig }): Promise<void>;
};

type Rc1ReservationState = { chain: Promise<void> };

function rc1ReservationState(): Rc1ReservationState {
  const target = globalThis as typeof globalThis & { __flowosRc1ReservationState?: Rc1ReservationState };
  target.__flowosRc1ReservationState ??= { chain: Promise.resolve() };
  return target.__flowosRc1ReservationState;
}

async function serialiseRc1Reservation<T>(operation: () => Promise<T>): Promise<T> {
  const state = rc1ReservationState();
  const previous = state.chain;
  let release: (() => void) | undefined;
  state.chain = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release?.();
  }
}

async function createRunRepository(request: AiRequest<unknown>): Promise<Rc1ReservationRepository> {
  const supabase = createAdminClient();
  const runMetadata = safeMetadata(request.metadata);
  let rc1ProviderCallReserved = false;

  return {
    async start(request) {
      const { data, error } = await supabase.rpc("start_ai_run", {
        target_company_id: request.companyId,
        target_initiated_by: request.userId,
        requested_kind: aiRunKind(request.feature),
        requested_prompt_version: "quote-gateway-v1",
        requested_metadata: runMetadata,
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

      const finishedMetadata = {
        ...runMetadata,
        ...(rc1ProviderCallReserved ? { rc1ProviderCallAttempted: true } : {}),
        ...(input.estimatedCostUsdMicros === null || input.estimatedCostUsdMicros === undefined
          ? {}
          : { estimatedCostUsdMicros: input.estimatedCostUsdMicros }),
        ...(input.estimatedCostCents === null || input.estimatedCostCents === undefined
          ? {}
          : { estimatedCostEurCents: input.estimatedCostCents }),
      };
      const { error: metadataError } = await supabase
        .from("ai_runs")
        .update({ metadata: finishedMetadata })
        .eq("id", input.runId)
        .eq("company_id", request.companyId);
      // A completed business action remains valid if this non-critical metadata mirror is unavailable.
      if (metadataError) return;
    },
    async reserveRc1ProviderCall({ runId, request: runRequest, config }) {
      await serialiseRc1Reservation(async () => {
        const marker = { rc1SpikeId: config.spikeId, rc1ProviderCallAttempted: true };
        const { data: attempts, error } = await supabase
          .from("ai_runs")
          .select("estimated_cost_cents")
          .contains("metadata", marker);
        if (error || !attempts) throw new AiRunError("RC1 AI-testlimiet kon niet veilig worden gecontroleerd.");

        assertRc1AttemptAllowed(config, attempts.map((attempt) => ({ estimatedCostCents: attempt.estimated_cost_cents })));
        const { error: reservationError } = await supabase
          .from("ai_runs")
          .update({ metadata: { ...safeMetadata(runRequest.metadata), ...marker } })
          .eq("id", runId)
          .eq("company_id", runRequest.companyId);
        if (reservationError) throw new AiRunError("RC1 AI-testlimiet kon niet veilig worden gereserveerd.");
        rc1ProviderCallReserved = true;
      });
    },
  };
}

export async function runAi<T>(request: AiRequest<T>, persist?: AiPersistence<T>): Promise<AiResult<T>> {
  if ((process.env.AI_PROVIDER ?? "openai") !== "openai") throw new AiRunError("Niet-ondersteunde AI-provider.");
  const enrichedRequest: AiRequest<T> = {
    ...request,
    metadata: { ...request.metadata, ...rc1SpikeMetadata() },
  };
  const runs = await createRunRepository(enrichedRequest);
  return executeAiRun(enrichedRequest, {
    provider: new OpenAiProvider(),
    runs,
    beforeProvider: async ({ runId }) => {
      const config = getRc1SpikeConfig(requestedModel(enrichedRequest));
      if (!config) return;
      assertRc1InputLimit(enrichedRequest.systemPrompt, enrichedRequest.userPrompt, config);
      await runs.reserveRc1ProviderCall({ runId, request: enrichedRequest, config });
    },
  }, persist);
}
