import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/health/server";
import { getRequestId, logServerEvent, withRequestId } from "@/lib/observability/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const timestamp = new Date().toISOString();
  try {
    await checkDatabaseHealth();
    return withRequestId(NextResponse.json({
      status: "ok",
      service: "flowos",
      timestamp,
      checks: { app: "ok", database: "ok" },
    }), requestId);
  } catch {
    logServerEvent({ level: "warn", event: "health.database_unhealthy", requestId, route: "/api/health", errorCode: "DATABASE_UNAVAILABLE" });
    return withRequestId(NextResponse.json({
      status: "unhealthy",
      service: "flowos",
      timestamp,
      checks: { app: "ok", database: "error" },
    }, { status: 503 }), requestId);
  }
}
