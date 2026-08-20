import { NextResponse } from "next/server";
import { z } from "zod";
import { planningEventTypes } from "@/features/planning/domain/planning";
import { planningModule } from "@/lib/entitlements/modules";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { logServerEvent, withApiRequest } from "@/lib/observability/server";
import { createClient } from "@/lib/supabase/server";

const dateTime = z.string().datetime({ offset: true });
const nullableUuid = z.union([z.string().uuid(), z.null()]).optional();
const eventFields = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  eventType: z.enum(planningEventTypes),
  startsAt: dateTime,
  endsAt: z.union([dateTime, z.null()]).optional(),
  allDay: z.boolean().optional().default(false),
  location: z.string().trim().max(240).nullable().optional(),
  assignedUserId: nullableUuid,
});

const createSchema = eventFields.extend({
  customerId: nullableUuid,
  quoteId: z.string().uuid().optional(),
});

const updateSchema = z.discriminatedUnion("action", [
  eventFields.extend({ action: z.literal("update"), eventId: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), eventId: z.string().uuid() }),
]);

type Membership = { role: string } | null;

function invalidDateRange(startsAt: string, endsAt?: string | null) {
  return endsAt !== null && endsAt !== undefined && new Date(endsAt).getTime() <= new Date(startsAt).getTime();
}

async function requirePlanningManager(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null as Membership };
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  return { supabase, user, membership: membership as Membership };
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/planning-events" }, async (requestId) => {
    const input = createSchema.safeParse(await request.json());
    if (!input.success || invalidDateRange(input.data?.startsAt ?? "", input.data?.endsAt)) {
      return NextResponse.json({ error: { code: "INVALID_PLANNING_EVENT", message: "Controleer de planninggegevens en tijden." } }, { status: 400 });
    }

    const { companyId } = await params;
    const { supabase, user, membership } = await requirePlanningManager(companyId);
    if (!user) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Log opnieuw in." } }, { status: 401 });
    if (!membership) return NextResponse.json({ error: { code: "PLANNING_FORBIDDEN", message: "Je hebt geen toegang tot deze organisatie." } }, { status: 403 });
    if (await resolveCompanyModuleAccess(supabase, companyId, planningModule) !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "PLANNING_MODULE_DISABLED", message: "Planning is niet beschikbaar voor deze organisatie." } }, { status: 403 });
    if (membership.role === "technician") return NextResponse.json({ error: { code: "PLANNING_FORBIDDEN", message: "Je mag geen planning aanpassen." } }, { status: 403 });

    let customerId = input.data.customerId ?? null;
    let sourceType: "manual" | "quote" = "manual";
    let quoteId: string | null = null;

    if (input.data.quoteId) {
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("id,customer_id,status")
        .eq("id", input.data.quoteId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (quoteError || !quote) return NextResponse.json({ error: { code: "QUOTE_NOT_FOUND", message: "Offerte niet gevonden." } }, { status: 404 });
      if (quote.status !== "accepted") return NextResponse.json({ error: { code: "QUOTE_NOT_ACCEPTED", message: "Alleen een geaccepteerde offerte kan aan de planning worden toegevoegd." } }, { status: 409 });
      customerId = quote.customer_id;
      quoteId = quote.id;
      sourceType = "quote";
    } else if (customerId) {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (customerError || !customer) return NextResponse.json({ error: { code: "CUSTOMER_NOT_FOUND", message: "Klant niet gevonden." } }, { status: 404 });
      customerId = customer.id;
    }

    if (input.data.assignedUserId) {
      const { data: assignee } = await supabase
        .from("company_memberships")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("user_id", input.data.assignedUserId)
        .maybeSingle();
      if (!assignee) return NextResponse.json({ error: { code: "ASSIGNEE_NOT_FOUND", message: "Verantwoordelijke niet gevonden in deze organisatie." } }, { status: 404 });
    }

    const { data: event, error } = await supabase.from("planning_events").insert({
      company_id: companyId,
      customer_id: customerId,
      quote_id: quoteId,
      title: input.data.title,
      description: input.data.description || null,
      event_type: input.data.eventType,
      starts_at: input.data.startsAt,
      ends_at: input.data.endsAt ?? null,
      all_day: input.data.allDay,
      location: input.data.location || null,
      assigned_user_id: input.data.assignedUserId ?? null,
      source_type: sourceType,
      created_by: user.id,
    }).select("id").maybeSingle();
    if (error || !event) {
      logServerEvent({ level: "error", event: "planning.create_failed", requestId, route: "/api/v1/companies/:companyId/planning-events", companyId, actorId: user.id, errorCode: "PLANNING_CREATE_FAILED" });
      return NextResponse.json({ error: { code: "PLANNING_CREATE_FAILED", message: "Het planning-item kon niet worden opgeslagen." } }, { status: 409 });
    }
    return NextResponse.json({ eventId: event.id }, { status: 201 });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/planning-events" }, async (requestId) => {
    const input = updateSchema.safeParse(await request.json());
    if (!input.success || (input.data.action === "update" && invalidDateRange(input.data.startsAt, input.data.endsAt))) {
      return NextResponse.json({ error: { code: "INVALID_PLANNING_EVENT", message: "Controleer de planninggegevens en tijden." } }, { status: 400 });
    }

    const { companyId } = await params;
    const { supabase, user, membership } = await requirePlanningManager(companyId);
    if (!user) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Log opnieuw in." } }, { status: 401 });
    if (!membership) return NextResponse.json({ error: { code: "PLANNING_FORBIDDEN", message: "Je hebt geen toegang tot deze organisatie." } }, { status: 403 });
    if (await resolveCompanyModuleAccess(supabase, companyId, planningModule) !== "MODULE_AVAILABLE") return NextResponse.json({ error: { code: "PLANNING_MODULE_DISABLED", message: "Planning is niet beschikbaar voor deze organisatie." } }, { status: 403 });
    if (membership.role === "technician") return NextResponse.json({ error: { code: "PLANNING_FORBIDDEN", message: "Je mag geen planning aanpassen." } }, { status: 403 });

    const { data: existing, error: existingError } = await supabase.from("planning_events")
      .select("id,status")
      .eq("id", input.data.eventId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingError || !existing) return NextResponse.json({ error: { code: "PLANNING_NOT_FOUND", message: "Planning-item niet gevonden." } }, { status: 404 });
    if (existing.status === "cancelled") return NextResponse.json({ error: { code: "PLANNING_CANCELLED", message: "Een geannuleerd planning-item kan niet worden aangepast." } }, { status: 409 });

    if (input.data.action === "update" && input.data.assignedUserId) {
      const { data: assignee } = await supabase.from("company_memberships").select("user_id").eq("company_id", companyId).eq("user_id", input.data.assignedUserId).maybeSingle();
      if (!assignee) return NextResponse.json({ error: { code: "ASSIGNEE_NOT_FOUND", message: "Verantwoordelijke niet gevonden in deze organisatie." } }, { status: 404 });
    }

    const changes = input.data.action === "cancel"
      ? { status: "cancelled" }
      : {
          title: input.data.title,
          description: input.data.description || null,
          event_type: input.data.eventType,
          starts_at: input.data.startsAt,
          ends_at: input.data.endsAt ?? null,
          all_day: input.data.allDay,
          location: input.data.location || null,
          assigned_user_id: input.data.assignedUserId ?? null,
        };
    const { data: updated, error } = await supabase.from("planning_events")
      .update(changes)
      .eq("id", existing.id)
      .eq("company_id", companyId)
      .select("id,status")
      .maybeSingle();
    if (error || !updated) {
      logServerEvent({ level: "error", event: input.data.action === "cancel" ? "planning.cancel_failed" : "planning.update_failed", requestId, route: "/api/v1/companies/:companyId/planning-events", companyId, actorId: user.id, errorCode: "PLANNING_UPDATE_FAILED" });
      return NextResponse.json({ error: { code: "PLANNING_UPDATE_FAILED", message: "Het planning-item kon niet worden bijgewerkt." } }, { status: 409 });
    }
    return NextResponse.json({ eventId: updated.id, status: updated.status });
  });
}
