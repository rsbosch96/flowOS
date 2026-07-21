import { calculateAiCost } from "./costs.ts";
import { getAiErrorCode } from "./errors.ts";
import type { AiPersistence, AiPersistenceResult, AiProvider, AiProviderName, AiRequest, AiResult } from "./types";

export type AiRunRepository = {
  start(request: AiRequest<unknown>): Promise<string>;
  finish(input: {
    runId: string;
    status: "succeeded" | "failed";
    quoteId?: string;
    provider?: AiProviderName;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostCents?: number | null;
    currency: "EUR";
    durationMs: number;
    errorCode?: string;
  }): Promise<void>;
};

export type GatewayDependencies = { provider: AiProvider; runs: AiRunRepository };

export async function executeAiRun<T>(
  request: AiRequest<T>,
  dependencies: GatewayDependencies,
  persist?: AiPersistence<T>,
): Promise<AiResult<T>> {
  const runId = await dependencies.runs.start(request);
  const startedAt = Date.now();

  try {
    const generated = await dependencies.provider.generate(request);
    const stored: AiPersistenceResult = persist ? await persist({ data: generated.data, runId }) : {};
    const durationMs = Date.now() - startedAt;
    const cost = calculateAiCost({ model: generated.model, usage: generated.usage });
    await dependencies.runs.finish({
      runId,
      status: "succeeded",
      quoteId: stored.quoteId,
      provider: generated.provider,
      model: generated.model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      totalTokens: generated.usage.totalTokens,
      estimatedCostCents: cost.estimatedCostCents,
      currency: cost.currency,
      durationMs,
    });
    return { ...generated, runId, quoteId: stored.quoteId, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    try {
      await dependencies.runs.finish({ runId, status: "failed", durationMs, currency: "EUR", errorCode: getAiErrorCode(error) });
    } catch {
      // The original typed AI error remains the useful error for the caller.
    }
    throw error;
  }
}
