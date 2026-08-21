import { NextResponse } from "next/server";
import { z } from "zod";
import { logServerEvent, safeErrorResponse, withApiRequest } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeRpcError } from "@/features/field-service/server";

const schema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(100),
  byteSize: z.number().int().positive().max(25 * 1024 * 1024),
});
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]);

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; workOrderId: string }> }) {
  const { companyId, workOrderId } = await params;
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/evidence/upload-url", companyId }, async (requestId) => {
    if (!z.string().uuid().safeParse(companyId).success || !z.string().uuid().safeParse(workOrderId).success) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Ongeldige organisatie of werkorder." } }, { status: 400 });
    }
    const input = schema.safeParse(await request.json());
    if (!input.success || !allowed.has(input.data.mimeType)) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Bestandstype of grootte is niet toegestaan." } }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return safeErrorResponse({ requestId, status: 401, code: "AUTH_REQUIRED", message: "Log opnieuw in." });
    const limited = await enforceRateLimit({
      policy: "document_upload_sign",
      subjectParts: [user.id, companyId, workOrderId],
      requestId,
      route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/evidence/upload-url",
      companyId,
      actorId: user.id,
    });
    if (limited) return limited;
    const { error: accessError } = await supabase.rpc("authorize_field_service_evidence_upload", {
      target_company_id: companyId,
      target_work_order_id: workOrderId,
    });
    if (accessError) {
      const normalized = normalizeRpcError(accessError);
      return safeErrorResponse({ requestId, status: normalized.status, code: normalized.code, message: normalized.message });
    }
    const documentId = crypto.randomUUID();
    const safeName = input.data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${companyId}/field-service/${workOrderId}/${documentId}/${safeName}`;
    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      company_id: companyId,
      customer_id: null,
      uploaded_by: user.id,
      storage_bucket: "company-documents",
      storage_path: path,
      original_filename: input.data.filename,
      mime_type: input.data.mimeType,
      byte_size: input.data.byteSize,
    });
    if (insertError) {
      logServerEvent({ level: "error", event: "field_service.evidence_registration_failed", requestId, route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/evidence/upload-url", companyId, actorId: user.id, errorCode: "EVIDENCE_REGISTRATION_FAILED" });
      return safeErrorResponse({ requestId, status: 500, code: "EVIDENCE_UPLOAD_PREPARE_FAILED", message: "Upload kon niet worden voorbereid." });
    }
    const { data, error: storageError } = await supabase.storage.from("company-documents").createSignedUploadUrl(path);
    if (storageError || !data) {
      await supabase.from("documents").delete().eq("id", documentId).eq("company_id", companyId);
      logServerEvent({ level: "error", event: "field_service.evidence_upload_url_failed", requestId, route: "/api/v1/companies/:companyId/field-service/work-orders/:workOrderId/evidence/upload-url", companyId, actorId: user.id, errorCode: "EVIDENCE_UPLOAD_URL_FAILED" });
      return safeErrorResponse({ requestId, status: 500, code: "EVIDENCE_UPLOAD_PREPARE_FAILED", message: "Upload kon niet worden voorbereid." });
    }
    return NextResponse.json({ documentId, path, token: data.token, signedUrl: data.signedUrl }, { status: 201 });
  });
}
