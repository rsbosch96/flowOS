export const AiErrorCode = {
  Timeout: "TIMEOUT",
  RateLimit: "RATE_LIMIT",
  BudgetExceeded: "BUDGET_EXCEEDED",
  BudgetStatusUnknown: "BUDGET_STATUS_UNKNOWN",
  ProviderError: "PROVIDER_ERROR",
  ValidationError: "VALIDATION_ERROR",
  Unknown: "UNKNOWN",
} as const;

export type AiErrorCode = typeof AiErrorCode[keyof typeof AiErrorCode];

export abstract class AiError extends Error {
  abstract readonly code: AiErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AiConfigurationError extends AiError { readonly code = AiErrorCode.ProviderError; }
export class AiProviderError extends AiError { readonly code = AiErrorCode.ProviderError; }
export class AiValidationError extends AiError { readonly code = AiErrorCode.ValidationError; }
export class AiRateLimitError extends AiError { readonly code = AiErrorCode.RateLimit; }
export class AiTimeoutError extends AiError { readonly code = AiErrorCode.Timeout; }
export class AiBudgetStatusUnknownError extends AiError { readonly code = AiErrorCode.BudgetStatusUnknown; }
export class AiSpikeLimitError extends AiError { readonly code = AiErrorCode.BudgetExceeded; }
export class AiStorageError extends AiError { readonly code = AiErrorCode.Unknown; }
export class AiRunError extends AiError { readonly code = AiErrorCode.Unknown; }

export function getAiErrorCode(error: unknown): AiErrorCode {
  return error instanceof AiError ? error.code : AiErrorCode.Unknown;
}
