import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/config/server";
import {
  DatabaseHealthError,
  getHealthCheckDiagnostic,
  safeHealthProviderCode,
} from "@/lib/health/diagnostics";
import { getRequestId, logServerEvent, withRequestId } from "@/lib/observability/server";

const HEALTH_TIMEOUT_MS = 2_000;

export type HealthCheckResult = {
  durationMs: number;
};
export type { HealthCheckDiagnostic, HealthFailureCategory } from "@/lib/health/diagnostics";
export { DatabaseHealthError, getHealthCheckDiagnostic } from "@/lib/health/diagnostics";

type HealthQueryResult = { error: { code?: unknown } | null };
type HealthClient = {
  from: (table: string) => {
    select: (columns: string, options: { head: boolean; count: "exact" }) => {
      limit: (count: number) => Promise<HealthQueryResult>;
    };
  };
};

type HealthCheckDependencies = {
  createClient?: () => HealthClient;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timeout: ReturnType<typeof setTimeout>) => void;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

type HealthRouteDependencies = {
  checkDatabaseHealth: typeof checkDatabaseHealth;
  logServerEvent: typeof logServerEvent;
};

export async function getHealthResponse(
  request: Request,
  dependencies: HealthRouteDependencies = { checkDatabaseHealth, logServerEvent },
) {
  const requestId = getRequestId(request);
  const timestamp = new Date().toISOString();
  try {
    await dependencies.checkDatabaseHealth();
    return withRequestId(NextResponse.json({
      status: "ok",
      service: "flowos",
      timestamp,
      checks: { app: "ok", database: "ok" },
    }), requestId);
  } catch (error) {
    const diagnostic = getHealthCheckDiagnostic(error);
    dependencies.logServerEvent({
      level: "warn",
      event: "health.database_unhealthy",
      requestId,
      route: "/api/health",
      errorCode: "DATABASE_UNAVAILABLE",
      context: {
        category: diagnostic.category,
        durationMs: diagnostic.durationMs,
        ...(diagnostic.providerCode ? { providerCode: diagnostic.providerCode } : {}),
      },
    });
    return withRequestId(NextResponse.json({
      status: "unhealthy",
      service: "flowos",
      timestamp,
      checks: { app: "ok", database: "error" },
    }, { status: 503 }), requestId);
  }
}

export async function checkDatabaseHealth(dependencies: HealthCheckDependencies = {}): Promise<HealthCheckResult> {
  const now = dependencies.now ?? Date.now;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = (dependencies.setTimeout ?? setTimeout)(() => {
    timedOut = true;
    controller.abort();
  }, HEALTH_TIMEOUT_MS);
  const startedAt = now();
  const supabase = dependencies.createClient?.() ?? (() => {
    const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: ((input, init) => fetch(input, { ...init, signal: controller.signal })) as typeof fetch,
      },
    });
  })();

  try {
    const { error } = await supabase.from("companies").select("id", { head: true, count: "exact" }).limit(1);
    const durationMs = Math.max(0, now() - startedAt);
    if (error) {
      throw new DatabaseHealthError({
        category: "supabase_api_error",
        durationMs,
        providerCode: safeHealthProviderCode(error.code),
      });
    }
    return { durationMs };
  } catch (error) {
    if (error instanceof DatabaseHealthError) throw error;
    throw new DatabaseHealthError({
      category: timedOut || isAbortError(error) ? "timeout" : "unexpected_error",
      durationMs: Math.max(0, now() - startedAt),
    });
  } finally {
    (dependencies.clearTimeout ?? clearTimeout)(timeout);
  }
}
