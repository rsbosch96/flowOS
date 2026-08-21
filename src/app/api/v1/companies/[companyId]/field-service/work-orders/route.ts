import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRequest } from "@/lib/observability/server";
import { createWorkOrderSchema, runFieldServiceRpc } from "@/features/field-service/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige organisatie." } }, { status: 400 });
    const input = createWorkOrderSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Controleer de werkordergegevens." } }, { status: 400 });
    return runFieldServiceRpc(requestId, "/api/v1/companies/:companyId/field-service/work-orders", companyId, "create_field_service_work_order", {
      target_company_id: companyId,
      target_customer_id: input.data.customerId,
      target_title: input.data.title,
      target_description: input.data.description ?? null,
      target_quote_id: input.data.quoteId ?? null,
      target_planning_event_id: input.data.planningEventId ?? null,
      target_assigned_user_id: input.data.assignedUserId ?? null,
    });
  });
}
