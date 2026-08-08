import "server-only";
import { NextResponse } from "next/server";
import { sanitizeLogContext } from "./sanitize";

export type LogLevel = "info" | "warn" | "error";

type ServerLogEvent = {
  level: LogLevel;
  event: string;
  requestId?: string;
  route?: string;
  errorCode?: string;
  companyId?: string;
  actorId?: string;
  context?: Record<string, unknown>;
};

const requestIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

export function getRequestId(request: Request) {
  const forwardedId = request.headers.get("x-request-id")?.trim();
  return forwardedId && requestIdPattern.test(forwardedId) ? forwardedId : crypto.randomUUID();
}

export function logServerEvent(input: ServerLogEvent) {
  const payload = {
    level: input.level,
    event: input.event,
    timestamp: new Date().toISOString(),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.route ? { route: input.route } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.companyId ? { companyId: input.companyId } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.context ? { context: sanitizeLogContext(input.context) } : {}),
  };
  const message = JSON.stringify(payload);
  if (input.level === "error") console.error(message);
  else if (input.level === "warn") console.warn(message);
  else console.info(message);
}

export function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set("x-request-id", requestId);
  return response;
}

export function safeErrorResponse(input: { requestId: string; status?: number; code?: string; message?: string }) {
  return withRequestId(NextResponse.json({
    error: {
      code: input.code ?? "INTERNAL_ERROR",
      message: input.message ?? "Er is iets misgegaan. Probeer het opnieuw.",
      requestId: input.requestId,
    },
  }, { status: input.status ?? 500 }), input.requestId);
}

export async function withApiRequest(
  request: Request,
  context: Pick<ServerLogEvent, "route" | "companyId" | "actorId">,
  handler: (requestId: string) => Promise<NextResponse>,
) {
  const requestId = getRequestId(request);
  try {
    return withRequestId(await handler(requestId), requestId);
  } catch {
    logServerEvent({ level: "error", event: "api.unhandled_error", requestId, route: context.route, companyId: context.companyId, actorId: context.actorId, errorCode: "INTERNAL_ERROR" });
    return safeErrorResponse({ requestId });
  }
}
