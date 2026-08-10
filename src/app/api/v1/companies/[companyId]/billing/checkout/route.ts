import { NextResponse } from "next/server";
import { getRequestId } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const requestId = getRequestId(request);
  const { companyId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "owner") return NextResponse.json({ error: { message: "Alleen een eigenaar mag een abonnement afsluiten." } }, { status: 403 });
  const rateLimitError = await enforceRateLimit({ policy: "billing_checkout", subjectParts: [user.id, companyId], requestId, route: "/api/v1/companies/:companyId/billing/checkout", companyId, actorId: user.id });
  if (rateLimitError) return rateLimitError;
  const price = process.env.STRIPE_PRICE_STARTER;
  if (!price) return NextResponse.json({ error: { message: "Stripe-prijs is nog niet geconfigureerd." } }, { status: 503 });
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).single();
  const { data: subscription } = await supabase.from("subscriptions").select("stripe_customer_id").eq("company_id", companyId).maybeSingle();
  const origin = new URL(request.url).origin;
  const session = await stripe().checkout.sessions.create({ mode: "subscription", customer: subscription?.stripe_customer_id ?? undefined, customer_email: subscription?.stripe_customer_id ? undefined : user.email, line_items: [{ price, quantity: 1 }], subscription_data: { trial_period_days: 14, metadata: { company_id: companyId } }, metadata: { company_id: companyId, company_name: company?.name ?? "AI FlowOS" }, success_url: `${origin}/app?billing=success`, cancel_url: `${origin}/app?billing=cancelled` });
  return NextResponse.json({ url: session.url });
}
