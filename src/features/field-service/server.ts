import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { logServerEvent, safeErrorResponse } from "@/lib/observability/server";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();

export const createWorkOrderSchema = z.object({
  customerId: uuid,
  quoteId: uuid.nullish(),
  planningEventId: uuid.nullish(),
  assignedUserId: uuid.nullish(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).nullish(),
});

export const assignmentSchema = z.object({ assignedUserId: uuid.nullish() });

const safeMessages: Record<string, { code: string; message: string; status: number }> = {
  FIELD_SERVICE_AUTH_REQUIRED: { code: "AUTH_REQUIRED", message: "Log opnieuw in.", status: 401 },
  FIELD_SERVICE_MEMBERSHIP_REQUIRED: { code: "FIELD_SERVICE_ACCESS_FORBIDDEN", message: "Je hebt geen toegang tot deze organisatie.", status: 403 },
  FIELD_SERVICE_MODULE_UNAVAILABLE: { code: "FIELD_SERVICE_NOT_AVAILABLE", message: "Field Service is niet beschikbaar voor deze organisatie.", status: 403 },
  FIELD_SERVICE_ROLE_FORBIDDEN: { code: "FIELD_SERVICE_ACCESS_FORBIDDEN", message: "Je hebt geen toestemming voor deze werkorderactie.", status: 403 },
  FIELD_SERVICE_ASSIGNMENT_FORBIDDEN: { code: "FIELD_SERVICE_ACCESS_FORBIDDEN", message: "Je hebt geen toestemming voor deze werkorderactie.", status: 403 },
  FIELD_SERVICE_WORK_ORDER_NOT_FOUND: { code: "WORK_ORDER_NOT_FOUND", message: "Werkorder niet gevonden.", status: 404 },
  FIELD_SERVICE_CUSTOMER_TENANT_MISMATCH: { code: "WORK_ORDER_CUSTOMER_TENANT_MISMATCH", message: "De klant kan niet aan deze werkorder worden gekoppeld.", status: 400 },
  FIELD_SERVICE_QUOTE_TENANT_MISMATCH: { code: "WORK_ORDER_QUOTE_INVALID", message: "De offerte kan niet aan deze werkorder worden gekoppeld.", status: 400 },
  FIELD_SERVICE_QUOTE_NOT_ACCEPTED: { code: "WORK_ORDER_QUOTE_INVALID", message: "Alleen een geaccepteerde offerte kan worden gekoppeld.", status: 409 },
  FIELD_SERVICE_CUSTOMER_SOURCE_MISMATCH: { code: "WORK_ORDER_QUOTE_INVALID", message: "De offerte hoort niet bij deze klant.", status: 400 },
  FIELD_SERVICE_PLANNING_TENANT_MISMATCH: { code: "WORK_ORDER_PLANNING_TENANT_MISMATCH", message: "Het planning-item kan niet aan deze werkorder worden gekoppeld.", status: 400 },
  FIELD_SERVICE_ASSIGNEE_INVALID: { code: "WORK_ORDER_ASSIGNEE_INVALID", message: "De verantwoordelijke hoort niet bij deze organisatie.", status: 400 },
  FIELD_SERVICE_ASSIGNEE_REQUIRED: { code: "WORK_ORDER_ASSIGNEE_REQUIRED", message: "Wijs eerst een verantwoordelijke toe.", status: 409 },
  FIELD_SERVICE_ASSIGNMENT_TERMINAL: { code: "WORK_ORDER_TRANSITION_INVALID", message: "Een afgeronde of geannuleerde werkorder kan niet opnieuw worden toegewezen.", status: 409 },
  FIELD_SERVICE_TRANSITION_INVALID: { code: "WORK_ORDER_TRANSITION_INVALID", message: "Deze werkorderstatus kan nu niet worden gewijzigd.", status: 409 },
  FIELD_SERVICE_TERMINAL_STATE: { code: "WORK_ORDER_TRANSITION_INVALID", message: "Deze werkorder is definitief afgesloten.", status: 409 },
  FIELD_SERVICE_CONCURRENT_CONFLICT: { code: "WORK_ORDER_CONFLICT", message: "De werkorder is intussen gewijzigd. Laad opnieuw en probeer het nogmaals.", status: 409 },
  FIELD_SERVICE_TITLE_INVALID: { code: "INVALID_INPUT", message: "Controleer de titel van de werkorder.", status: 400 },
  FIELD_SERVICE_DESCRIPTION_INVALID: { code: "INVALID_INPUT", message: "Controleer de omschrijving van de werkorder.", status: 400 },
  FIELD_SERVICE_INVALID_INITIAL_STATE: { code: "INVALID_INPUT", message: "De werkorder kan niet met deze beginstatus worden aangemaakt.", status: 400 },
};

function normalizeRpcError(error: { message?: unknown } | null | undefined) {
  const raw = typeof error?.message === "string" ? error.message : "";
  const key = Object.keys(safeMessages).find((candidate) => raw.includes(candidate));
  return key ? safeMessages[key] : { code: "FIELD_SERVICE_OPERATION_FAILED", message: "De werkorderactie kon niet worden uitgevoerd.", status: 409 };
}

type RpcName =
  | "create_field_service_work_order"
  | "assign_field_service_work_order"
  | "dispatch_field_service_work_order"
  | "start_field_service_work_order"
  | "complete_field_service_work_order"
  | "cancel_field_service_work_order";

export async function runFieldServiceRpc(
  requestId: string,
  route: string,
  companyId: string,
  rpcName: RpcName,
  args: Record<string, unknown>,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return safeErrorResponse({ requestId, status: 401, code: "AUTH_REQUIRED", message: "Log opnieuw in." });

  const { data, error } = await supabase.rpc(rpcName, args);
  if (error) {
    const normalized = normalizeRpcError(error);
    logServerEvent({ level: "warn", event: "field_service.operation_denied", requestId, route, companyId, actorId: user.id, errorCode: normalized.code });
    return safeErrorResponse({ requestId, status: normalized.status, code: normalized.code, message: normalized.message });
  }
  return NextResponse.json({ workOrder: data });
}

export async function runFieldServiceTransitionRpc(
  requestId: string,
  route: string,
  companyId: string,
  workOrderId: string,
  rpcName: Exclude<RpcName, "create_field_service_work_order" | "assign_field_service_work_order">,
) {
  return runFieldServiceRpc(requestId, route, companyId, rpcName, {
    target_company_id: companyId,
    target_work_order_id: workOrderId,
  });
}
