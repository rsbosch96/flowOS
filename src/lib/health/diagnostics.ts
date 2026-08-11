export type HealthFailureCategory = "timeout" | "supabase_api_error" | "unexpected_error";

export type HealthCheckDiagnostic = {
  category: HealthFailureCategory;
  durationMs: number;
  providerCode?: string;
};

export class DatabaseHealthError extends Error {
  readonly diagnostic: HealthCheckDiagnostic;

  constructor(diagnostic: HealthCheckDiagnostic) {
    super("DATABASE_UNAVAILABLE");
    this.name = "DatabaseHealthError";
    this.diagnostic = diagnostic;
  }
}

export function safeHealthProviderCode(value: unknown) {
  return typeof value === "string" && /^(?:PGRST\d{3}|[0-9A-Z]{5}|[45]\d\d)$/.test(value)
    ? value
    : undefined;
}

export function getHealthCheckDiagnostic(error: unknown): HealthCheckDiagnostic {
  return error instanceof DatabaseHealthError
    ? error.diagnostic
    : { category: "unexpected_error", durationMs: 0 };
}
