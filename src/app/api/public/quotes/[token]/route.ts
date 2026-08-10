import { NextResponse } from "next/server";
import { z } from "zod";
import { logServerEvent, rateLimitResponse, withApiRequest } from "@/lib/observability/server";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accepted"), comment: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("rejected"), comment: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("question"), comment: z.string().trim().min(2).max(2000) }),
]);

function retryAfterSeconds(details: string | null) {
  const value = Number(details);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return withApiRequest(request, { route: "/api/public/quotes/:token" }, async (requestId) => {
  const { token } = await params;
  if (!tokenSchema.safeParse(token).success) {
    return NextResponse.json({ error: { message: "Deze offertelink is niet beschikbaar." } }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Ongeldige invoer." } }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { message: "Ongeldige invoer." } }, { status: 400 });

  const supabase = await createClient();
  const { action, comment } = parsed.data;
  const { data, error } = action === "question"
    ? await supabase.rpc("customer_question_quote", { raw_token: token, question: comment })
    : await supabase.rpc("customer_decide_quote", { raw_token: token, decision: action, comment: comment ?? null });

  if (error?.code === "RATE_LIMITED") {
    const policy = action === "question" ? "public_quote_question" : `public_quote_decision_${action}`;
    logServerEvent({ level: "warn", event: "rate_limit.blocked", requestId, route: "/api/public/quotes/:token", context: { policy } });
    return rateLimitResponse({ requestId, retryAfterSeconds: retryAfterSeconds(error.details) });
  }
  if (error || !data) {
    return NextResponse.json({ error: { message: "Deze offertelink is niet beschikbaar." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
  });
}
