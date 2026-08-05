import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordServerAuditEvent } from "@/lib/audit/server";

const rotateSchema = z.object({ expiryDays: z.number().int().min(1).max(90).optional() });

async function access(companyId: string, quoteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, quote: null, error: NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 }) };
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return { supabase, user, quote: null, error: NextResponse.json({ error: { message: "Je mag deze klantlink niet beheren." } }, { status: 403 }) };
  const { data: quote } = await supabase.from("quotes").select("id,company_id,status").eq("id", quoteId).eq("company_id", companyId).maybeSingle();
  if (!quote) return { supabase, user, quote: null, error: NextResponse.json({ error: { message: "Offerte niet gevonden." } }, { status: 404 }) };
  return { supabase, user, quote, error: null };
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const input = rotateSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) return NextResponse.json({ error: { message: "Ongeldige geldigheidsduur." } }, { status: 400 });
  const { companyId, quoteId } = await params;
  const context = await access(companyId, quoteId);
  if (context.error || !context.quote || !context.user) return context.error!;
  if (context.quote.status !== "sent") return NextResponse.json({ error: { message: "Alleen een verstuurde offerte kan een nieuwe klantlink krijgen." } }, { status: 409 });
  const { data: token, error } = await context.supabase.rpc("rotate_public_quote_token", { target_quote_id: context.quote.id, target_company_id: context.quote.company_id, expiry_days: input.data.expiryDays ?? 30 });
  if (error || typeof token !== "string") return NextResponse.json({ error: { message: "De klantlink kon niet worden vernieuwd." } }, { status: 409 });
  await recordServerAuditEvent({ companyId: context.quote.company_id, actorUserId: context.user.id, action: "quote.token_rotated", entityType: "quote", entityId: context.quote.id });
  return NextResponse.json({ url: `${new URL(request.url).origin}/offerte/${token}` });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ companyId: string; quoteId: string }> }) {
  const { companyId, quoteId } = await params;
  const context = await access(companyId, quoteId);
  if (context.error || !context.quote || !context.user) return context.error!;
  const { data: revoked, error } = await context.supabase.rpc("revoke_public_quote_token", { target_quote_id: context.quote.id, target_company_id: context.quote.company_id });
  if (error || !revoked) return NextResponse.json({ error: { message: "De klantlink kon niet worden ingetrokken." } }, { status: 409 });
  await recordServerAuditEvent({ companyId: context.quote.company_id, actorUserId: context.user.id, action: "quote.token_revoked", entityType: "quote", entityId: context.quote.id });
  return NextResponse.json({ ok: true });
}
