import type { z } from "zod";
import type { SupportedLanguage, SupportedLocale } from "../i18n/config.ts";

export type AiProviderName = "openai";
export type AiFeature = "quote_generation" | "document_extraction" | "email_drafting" | "support_reply";
export type AiUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostCents?: number | null; currency?: "EUR" };
export type AiMetadata = Record<string, string | number | boolean>;

export const AiBudgetStatus = {
  Disabled: "disabled",
  Unlimited: "unlimited",
  Ok: "ok",
  Warning: "warning",
  Exceeded: "exceeded",
  Unknown: "unknown",
} as const;

export type AiBudgetStatus = typeof AiBudgetStatus[keyof typeof AiBudgetStatus];

/**
 * Contract for the future budget engine. Unknown provider costs deliberately
 * remain visible and cannot be treated as zero spend.
 */
export type AiBudgetCostSnapshot = {
  status: AiBudgetStatus;
  knownSpendCents: number;
  unknownCostRunCount: number;
};

export type AiRequest<T> = {
  companyId: string;
  userId: string;
  feature: AiFeature;
  language: SupportedLanguage;
  locale: SupportedLocale;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodType<T>;
  metadata?: AiMetadata;
  preferredModel?: string;
};

export type AiResult<T> = {
  data: T;
  provider: AiProviderName;
  model: string;
  usage: AiUsage;
  durationMs: number;
  confidence?: number;
  runId: string;
  quoteId?: string;
};

export type AiPersistenceResult = { quoteId?: string };
export type AiPersistence<T> = (context: { data: T; runId: string }) => Promise<AiPersistenceResult>;

export interface AiProvider {
  readonly name: AiProviderName;
  generate<T>(request: AiRequest<T>): Promise<Omit<AiResult<T>, "runId" | "durationMs" | "quoteId">>;
}
