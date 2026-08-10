import "server-only";
import { calculateAiCostDetails, getUsdEurRate, parseModelPricing } from "./costs.ts";
import { AiConfigurationError, AiSpikeLimitError, AiValidationError } from "./errors.ts";

const MAX_RC1_CALLS = 5;
const MAX_RC1_BUDGET_CENTS = 25;
const MAX_RC1_OUTPUT_TOKENS = 800;
const MAX_RC1_INPUT_TOKENS = 4_000;
// A UTF-8 byte is a conservative upper bound for a token in the text input.
// The remaining 400-token headroom covers Responses message framing.
const MAX_RC1_INPUT_BYTES = 3_600;

export type Rc1SpikeConfig = {
  spikeId: string;
  maxCalls: number;
  budgetCents: number;
  maxOutputTokens: number;
  maxInputTokens: number;
  maxInputBytes: number;
  maxCostPerCallCents: number;
  maxCostPerCallUsdMicros: number;
};

export type Rc1PriorAttempt = { estimatedCostCents: number | null };

function boundedInteger(name: string, fallback: number, maximum: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new AiConfigurationError(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

export function isMockAiMode() {
  return process.env.AI_MODE === "mock";
}

export function rc1SpikeMetadata(): Record<string, string> {
  if (isMockAiMode()) return {};
  const spikeId = process.env.AI_RC1_SPIKE_ID?.trim();
  return spikeId ? { rc1SpikeId: spikeId } : {};
}

export function getRc1SpikeConfig(model: string): Rc1SpikeConfig | null {
  if (isMockAiMode()) return null;
  if (process.env.AI_RC1_SPIKE_ENABLED !== "true") {
    throw new AiConfigurationError("Live AI is only enabled for an explicitly configured RC1 spike.");
  }

  const spikeId = process.env.AI_RC1_SPIKE_ID?.trim();
  if (!spikeId || spikeId.length > 80) {
    throw new AiConfigurationError("A bounded RC1 spike identifier is required for live AI.");
  }

  const maxCalls = boundedInteger("AI_RC1_MAX_CALLS", MAX_RC1_CALLS, MAX_RC1_CALLS);
  const budgetCents = boundedInteger("AI_RC1_SPIKE_BUDGET_CENTS", MAX_RC1_BUDGET_CENTS, MAX_RC1_BUDGET_CENTS);
  const maxOutputTokens = boundedInteger("AI_RC1_MAX_OUTPUT_TOKENS", MAX_RC1_OUTPUT_TOKENS, MAX_RC1_OUTPUT_TOKENS);
  const maxInputBytes = boundedInteger("AI_RC1_MAX_INPUT_BYTES", MAX_RC1_INPUT_BYTES, MAX_RC1_INPUT_BYTES);

  const maxCost = calculateAiCostDetails({
    model,
    usage: { inputTokens: MAX_RC1_INPUT_TOKENS, outputTokens: maxOutputTokens },
    pricing: parseModelPricing(),
    usdEurRate: getUsdEurRate(),
  });
  if (maxCost.estimatedCostCents === null || maxCost.estimatedCostUsdMicros === null) {
    throw new AiConfigurationError("Verified model pricing and a USD to EUR rate are required for live AI.");
  }

  return {
    spikeId,
    maxCalls,
    budgetCents,
    maxOutputTokens,
    maxInputTokens: MAX_RC1_INPUT_TOKENS,
    maxInputBytes,
    maxCostPerCallCents: maxCost.estimatedCostCents,
    maxCostPerCallUsdMicros: maxCost.estimatedCostUsdMicros,
  };
}

export function assertRc1InputLimit(systemPrompt: string, userPrompt: string, config: Rc1SpikeConfig) {
  const inputBytes = new TextEncoder().encode(`${systemPrompt}\n${userPrompt}`).byteLength;
  if (inputBytes > config.maxInputBytes) {
    throw new AiValidationError("AI-aanvraag overschrijdt de veilige RC1-invoerlimiet.");
  }
}

export function assertRc1AttemptAllowed(config: Rc1SpikeConfig, attempts: Rc1PriorAttempt[]) {
  if (attempts.length >= config.maxCalls) {
    throw new AiSpikeLimitError("De begrensde RC1 AI-testlimiet is bereikt.");
  }
  if (attempts.some((attempt) => attempt.estimatedCostCents === null)) {
    throw new AiConfigurationError("Een eerdere RC1 AI-run heeft geen verifieerbare kostenregistratie.");
  }

  const knownSpentCents = attempts.reduce((sum, attempt) => sum + (attempt.estimatedCostCents ?? 0), 0);
  const remainingCallsIncludingCurrent = config.maxCalls - attempts.length;
  const maximumRemainingCents = remainingCallsIncludingCurrent * config.maxCostPerCallCents;
  if (knownSpentCents + maximumRemainingCents > config.budgetCents) {
    throw new AiSpikeLimitError("De begrensde RC1 AI-test zou het kostenplafond overschrijden.");
  }
}
