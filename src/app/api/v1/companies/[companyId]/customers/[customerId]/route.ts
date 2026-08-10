import { NextResponse } from "next/server";
import { z } from "zod";
import { logServerEvent, withApiRequest } from "@/lib/observability/server";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.union([z.string().trim().email().max(320), z.literal("")]).optional().default(""),
  street: z.string().trim().max(200).optional().default(""),
  postalCode: z.string().trim().max(40).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
});

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; customerId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/customers/:customerId" }, async (requestId) => {
    const input = inputSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: "Controleer de klantgegevens." } }, { status: 400 });

    const { companyId, customerId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });

    const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
    if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag klantgegevens niet aanpassen." } }, { status: 403 });

    const { data: customer, error: customerError } = await supabase.from("customers").select("id,address").eq("id", customerId).eq("company_id", companyId).maybeSingle();
    if (customerError || !customer) return NextResponse.json({ error: { message: "Klant niet gevonden." } }, { status: 404 });

    const address = {
      ...asObject(customer.address),
      street: input.data.street,
      postal_code: input.data.postalCode,
      city: input.data.city,
      country: input.data.country,
    };
    const { error: updateError } = await supabase.from("customers").update({
      name: input.data.name,
      email: input.data.email || null,
      address,
      updated_at: new Date().toISOString(),
    }).eq("id", customer.id).eq("company_id", companyId);
    if (updateError) {
      logServerEvent({ level: "error", event: "customer.update_failed", requestId, route: "/api/v1/companies/:companyId/customers/:customerId", companyId, actorId: user.id, errorCode: "CUSTOMER_UPDATE_FAILED" });
      return NextResponse.json({ error: { message: "Klantgegevens konden niet worden opgeslagen." } }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  });
}
