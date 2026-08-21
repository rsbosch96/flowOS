import { NextResponse } from "next/server";
import { z } from "zod";
import { runFieldServiceTransitionRpc } from "@/features/field-service/server";
import { withApiRequest } from "@/lib/observability/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; workOrderId: string }> }) {
  const { companyId, workOrderId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/dispatch", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success || !z.string().uuid().safeParse(workOrderId).success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige werkorder." } }, { status: 400 });
    return runFieldServiceTransitionRpc(requestId, "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/dispatch", companyId, workOrderId, "dispatch_field_service_work_order");
  });
}
