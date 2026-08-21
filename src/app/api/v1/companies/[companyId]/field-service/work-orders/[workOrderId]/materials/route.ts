import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRequest } from "@/lib/observability/server";
import { materialSchema, runFieldServiceExecutionRpc } from "@/features/field-service/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; workOrderId: string }> }) {
  const { companyId, workOrderId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/materials", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success || !z.string().uuid().safeParse(workOrderId).success) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige organisatie of werkorder." } }, { status: 400 });
    }
    const input = materialSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Controleer het materiaal." } }, { status: 400 });
    return runFieldServiceExecutionRpc(requestId, "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/materials", companyId, "add_field_service_material", {
      target_company_id: companyId,
      target_work_order_id: workOrderId,
      target_source_kind: input.data.sourceKind,
      target_product_id: input.data.productId ?? null,
      target_description: input.data.description ?? null,
      target_unit: input.data.unit ?? null,
      target_quantity: input.data.quantity,
      target_external_reason: input.data.externalReason ?? null,
    });
  });
}
