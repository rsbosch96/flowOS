import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestId } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ companyName: z.string().trim().min(2).max(160), fullName: z.string().trim().min(2).max(120) });

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Controleer de ingevulde gegevens." } }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log eerst in." } }, { status: 401 });
  const rateLimitError = await enforceRateLimit({ policy: "onboarding", subjectParts: [user.id], requestId, route: "/api/v1/onboarding", actorId: user.id });
  if (rateLimitError) return rateLimitError;
  const { data, error } = await supabase.rpc("bootstrap_company", { company_name: parsed.data.companyName, profile_name: parsed.data.fullName });
  if (error) {
    const detail = process.env.NODE_ENV === "development" ? ` Technische melding: ${error.message}` : "";
    return NextResponse.json({ error: { code: "ONBOARDING_FAILED", message: `De organisatie kon niet worden aangemaakt.${detail}` } }, { status: 409 });
  }
  return NextResponse.json({ slug: data as string }, { status: 201 });
}
