import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiRequest } from "@/lib/observability/server";
import { runFieldServiceExecutionRpc, signoffSchema } from "@/features/field-service/server";

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; workOrderId: string }> }) {
  const { companyId, workOrderId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/signoff", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success || !z.string().uuid().safeParse(workOrderId).success) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige organisatie of werkorder." } }, { status: 400 });
    }
    const input = signoffSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Controleer de opleverbevestiging." } }, { status: 400 });
    return runFieldServiceExecutionRpc(requestId, "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/signoff", companyId, "record_field_service_signoff", {
      target_company_id: companyId,
      target_work_order_id: workOrderId,
      target_customer_name: input.data.customerName,
      target_confirmation_method: input.data.confirmationMethod,
      target_signature_document_id: input.data.signatureDocumentId ?? null,
    });
  });
}
