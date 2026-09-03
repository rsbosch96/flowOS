import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ token: z.string().min(1).max(128) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: { message: "Ongeldige uitnodiging." } }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log eerst in om de uitnodiging te accepteren." } }, { status: 401 });
  const { data, error } = await supabase.rpc("accept_company_invitation", { raw_token: parsed.data.token });
  if (error) return NextResponse.json({ error: { message: "Deze uitnodiging is niet geldig of kan niet worden gebruikt." } }, { status: 409 });
  return NextResponse.json({ ok: true, membership: data });
}

