import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRequest } from "@/lib/observability/server";
import { evidenceSchema, runFieldServiceExecutionRpc } from "@/features/field-service/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; workOrderId: string }> }) {
  const { companyId, workOrderId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/evidence", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success || !z.string().uuid().safeParse(workOrderId).success) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige organisatie of werkorder." } }, { status: 400 });
    }
    const input = evidenceSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Controleer het bewijsmateriaal." } }, { status: 400 });
    return runFieldServiceExecutionRpc(requestId, "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/evidence", companyId, "record_field_service_evidence", {
      target_company_id: companyId,
      target_work_order_id: workOrderId,
      target_document_id: input.data.documentId,
      target_evidence_type: input.data.evidenceType,
    });
  });
}
