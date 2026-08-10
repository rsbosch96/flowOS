import "server-only";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerEvent, rateLimitResponse, safeErrorResponse } from "@/lib/observability/server";

export const rateLimitPolicies = [
  "ai_quote_generate",
  "billing_checkout",
  "document_upload_sign",
  "invoice_create",
  "invoice_status",
  "onboarding",
  "product_image_upload_sign",
  "quote_email",
  "quote_publish_or_token",
  "quote_reminder",
] as const;

export type RateLimitPolicy = typeof rateLimitPolicies[number];

type RateLimitDecision = { allowed: boolean; remaining: number; retry_after_seconds: number };

function subjectHash(parts: string[]) {
  return createHash("sha256").update(parts.map((part) => `${part.length}:${part}`).join("|"), "utf8").digest("hex");
}

export async function enforceRateLimit(input: {
  policy: RateLimitPolicy;
  subjectParts: string[];
  requestId: string;
  route: string;
  companyId?: string;
  actorId?: string;
}) {
  try {
    const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
      requested_policy: input.policy,
      requested_subject_hash: subjectHash(input.subjectParts),
    });
    const decision = Array.isArray(data) ? data[0] as RateLimitDecision | undefined : data as RateLimitDecision | null;
    if (error || !decision || typeof decision.allowed !== "boolean") throw new Error("RATE_LIMIT_UNAVAILABLE");

    if (!decision.allowed) {
      logServerEvent({ level: "warn", event: "rate_limit.blocked", requestId: input.requestId, route: input.route, companyId: input.companyId, actorId: input.actorId, context: { policy: input.policy } });
      return rateLimitResponse({ requestId: input.requestId, retryAfterSeconds: decision.retry_after_seconds });
    }
    return null;
  } catch {
    logServerEvent({ level: "error", event: "rate_limit.unavailable", requestId: input.requestId, route: input.route, companyId: input.companyId, actorId: input.actorId, errorCode: "RATE_LIMIT_UNAVAILABLE", context: { policy: input.policy } });
    return safeErrorResponse({ requestId: input.requestId, status: 503, code: "RATE_LIMIT_UNAVAILABLE", message: "Deze actie is tijdelijk niet beschikbaar. Probeer het later opnieuw." });
  }
}
