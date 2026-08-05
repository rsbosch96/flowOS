import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accepted"), comment: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("rejected"), comment: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("question"), comment: z.string().trim().min(2).max(2000) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
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

  if (error || !data) {
    return NextResponse.json({ error: { message: "Deze offertelink is niet beschikbaar." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
