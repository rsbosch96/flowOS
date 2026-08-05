import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function recordServerAuditEvent(input: {
  companyId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await createAdminClient().from("audit_logs").insert({
    company_id: input.companyId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error("Audit event could not be recorded.");
}
