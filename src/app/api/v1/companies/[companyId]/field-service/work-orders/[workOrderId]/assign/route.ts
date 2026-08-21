import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRequest } from "@/lib/observability/server";
import { assignmentSchema, runFieldServiceRpc } from "@/features/field-service/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; workOrderId: string }> }) {
  const { companyId, workOrderId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/assign", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success || !z.string().uuid().safeParse(workOrderId).success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige werkorder." } }, { status: 400 });
    const input = assignmentSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige verantwoordelijke." } }, { status: 400 });
    return runFieldServiceRpc(requestId, "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/assign", companyId, "assign_field_service_work_order", {
      target_company_id: companyId,
      target_work_order_id: workOrderId,
      target_assigned_user_id: input.data.assignedUserId ?? null,
    });
  });
}
