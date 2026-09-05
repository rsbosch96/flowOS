import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestId, logServerEvent, safeErrorResponse, withApiRequest } from "@/lib/observability/server";

const inputSchema = z.object({ companyId: z.string().uuid() });

function matchesOperatorKey(supplied: string, expected: string) {
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function activationError(message: string | undefined) {
  if (message?.includes("COMMERCIAL_COMPANY_NOT_FOUND")) return { status: 404, code: "COMPANY_NOT_FOUND", message: "Bedrijf niet gevonden." };
  if (message?.includes("COMMERCIAL_CAPACITY_EXCEEDED")) return { status: 409, code: "CAPACITY_EXCEEDED", message: "De huidige bezetting overschrijdt de Early Access-capaciteit." };
  if (message?.includes("COMMERCIAL_SUBSCRIPTION_CONFLICT")) return { status: 409, code: "SUBSCRIPTION_CONFLICT", message: "Er bestaat al een conflicterend commercieel contract." };
  if (message?.includes("COMMERCIAL_ACTIVATION_INCOMPLETE")) return { status: 409, code: "ACTIVATION_INCOMPLETE", message: "Commerciële activatie is onvolledig en vereist onderzoek." };
  if (message?.includes("COMMERCIAL_EARLY_ACCESS_PLAN_UNAVAILABLE")) return { status: 503, code: "PLAN_UNAVAILABLE", message: "Het Early Access-plan is niet beschikbaar." };
  return { status: 500, code: "ACTIVATION_FAILED", message: "Commerciële activatie is niet uitgevoerd." };
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  return withApiRequest(request, { route: "/api/internal/early-access/activate" }, async () => {
    const enabled = process.env.FLOWOS_EARLY_ACCESS_OPERATOR_ENABLED === "true";
    const expectedKey = process.env.FLOWOS_EARLY_ACCESS_OPERATOR_KEY?.trim();
    if (!enabled || !expectedKey) {
      return safeErrorResponse({ requestId, status: 503, code: "OPERATOR_ACTIVATION_DISABLED", message: "Deze operatoractie is niet beschikbaar." });
    }

    const suppliedKey = request.headers.get("x-flowos-operator-key") ?? "";
    if (!matchesOperatorKey(suppliedKey, expectedKey)) {
      return safeErrorResponse({ requestId, status: 401, code: "OPERATOR_AUTH_REQUIRED", message: "Operatorautorisatie vereist." });
    }

    const body = await request.json().catch(() => null);
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return safeErrorResponse({ requestId, status: 400, code: "INVALID_COMPANY", message: "Een geldig bedrijfs-ID is vereist." });
    }

    const { data, error } = await createAdminClient().rpc("activate_early_access_company", {
      target_company_id: parsed.data.companyId,
    });
    if (error) {
      const mapped = activationError(error.message);
      logServerEvent({
        level: "warn",
        event: "commercial.activation_denied",
        requestId,
        route: "/api/internal/early-access/activate",
        companyId: parsed.data.companyId,
        errorCode: mapped.code,
      });
      return safeErrorResponse({ requestId, status: mapped.status, code: mapped.code, message: mapped.message });
    }

    logServerEvent({
      level: "info",
      event: "commercial.activation_completed",
      requestId,
      route: "/api/internal/early-access/activate",
      companyId: parsed.data.companyId,
    });
    return NextResponse.json({ activation: data }, { status: 200 });
  });
}
