import type { AiUsage } from "./types";

export type AiCurrency = "EUR";
export type ModelPricing = { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number };
export type ModelPricingTable = Record<string, ModelPricing>;

export type AiCost = { estimatedCostCents: number | null; currency: AiCurrency };
export type AiCostDetails = AiCost & { estimatedCostUsdMicros: number | null };

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseModelPricing(value = process.env.AI_MODEL_PRICING_JSON): ModelPricingTable {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, Partial<ModelPricing>>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([model, pricing]) => {
      const input = positiveNumber(pricing.inputUsdPerMillionTokens);
      const output = positiveNumber(pricing.outputUsdPerMillionTokens);
      return input !== null && output !== null ? [[model, { inputUsdPerMillionTokens: input, outputUsdPerMillionTokens: output }]] : [];
    }));
  } catch {
    return {};
  }
}

export function getUsdEurRate(value = process.env.AI_USD_EUR_RATE): number | null {
  return positiveNumber(value);
}

export function calculateAiCost(input: {
  model: string;
  usage: Pick<AiUsage, "inputTokens" | "outputTokens">;
  pricing?: ModelPricingTable;
  usdEurRate?: number | null;
}): AiCost {
  const { estimatedCostCents, currency } = calculateAiCostDetails(input);
  return { estimatedCostCents, currency };
}

export function calculateAiCostDetails(input: {
  model: string;
  usage: Pick<AiUsage, "inputTokens" | "outputTokens">;
  pricing?: ModelPricingTable;
  usdEurRate?: number | null;
}): AiCostDetails {
  const pricing = (input.pricing ?? parseModelPricing())[input.model];
  const usdEurRate = input.usdEurRate === undefined ? getUsdEurRate() : input.usdEurRate;
  const inputTokens = input.usage.inputTokens;
  const outputTokens = input.usage.outputTokens;
  if (!pricing || usdEurRate === null || inputTokens === undefined || outputTokens === undefined) {
    return { estimatedCostCents: null, estimatedCostUsdMicros: null, currency: "EUR" };
  }

  const usd = (inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens
    + (outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  return {
    estimatedCostCents: Math.ceil(usd * usdEurRate * 100),
    estimatedCostUsdMicros: Math.ceil(usd * 1_000_000),
    currency: "EUR",
  };
}
