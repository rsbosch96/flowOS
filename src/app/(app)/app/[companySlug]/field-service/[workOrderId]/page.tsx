import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { WorkOrderDetail, type WorkOrderDetailData } from "@/features/field-service/components/work-order-detail";
import { fieldServiceModule } from "@/lib/entitlements/modules";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createClient } from "@/lib/supabase/server";

export default async function FieldServiceWorkOrderPage({ params }: { params: Promise<{ companySlug: string; workOrderId: string }> }) {
  const { companySlug, workOrderId } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id,name,slug").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle();
  if (!membership || await resolveCompanyModuleAccess(supabase, company.id, fieldServiceModule) !== "MODULE_AVAILABLE") notFound();

  const { data: row } = await supabase.from("field_service_work_orders").select("id,company_id,customer_id,quote_id,planning_event_id,assigned_user_id,title,description,status,started_at,completed_at,cancelled_at,created_by,created_at,updated_at,customers(name),quotes(quote_number,title,status,total_cents),planning_events(title,starts_at)").eq("id", workOrderId).eq("company_id", company.id).maybeSingle();
  if (!row) notFound();

  const [{ data: materials }, { data: notes }, { data: evidence }, { data: signoffs }, { data: products }, { data: memberships }] = await Promise.all([
    supabase.from("field_service_work_order_materials").select("id,source_kind,product_id,description_snapshot,unit_snapshot,quantity,created_at,added_by,product_catalog_items(name,sku)").eq("work_order_id", row.id).eq("company_id", company.id).order("created_at", { ascending: false }),
    supabase.from("field_service_work_order_notes").select("id,body,created_by,created_at").eq("work_order_id", row.id).eq("company_id", company.id).order("created_at", { ascending: false }),
    supabase.from("field_service_work_order_evidence").select("id,document_id,evidence_type,uploaded_by,created_at,documents(original_filename,mime_type)").eq("work_order_id", row.id).eq("company_id", company.id).order("created_at", { ascending: false }),
    supabase.from("field_service_work_order_signoffs").select("id,customer_name,confirmation_method,signature_document_id,recorded_by,created_at").eq("work_order_id", row.id).eq("company_id", company.id).maybeSingle(),
    supabase.from("product_catalog_items").select("id,name,sku,unit,is_active").eq("company_id", company.id).eq("is_active", true).order("name").limit(200),
    supabase.from("company_memberships").select("user_id,role,users(full_name,email)").eq("company_id", company.id),
  ]);

  const memberLabels = (memberships ?? []).map((entry) => {
    const account = entry.users as unknown as { full_name: string | null; email: string } | null;
    return { id: entry.user_id, role: entry.role, label: account?.full_name || account?.email || "Gebruiker" };
  });
  const customerName = ((row.customers as unknown as { name: string } | null)?.name) ?? "Onbekende klant";
  const quote = row.quotes as unknown as { quote_number: string; title: string; status: string; total_cents: number } | null;
  const planningEvent = row.planning_events as unknown as { title: string; starts_at: string } | null;
  const workOrder: WorkOrderDetailData = {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customerName,
    quoteId: row.quote_id,
    quote: quote ? { number: quote.quote_number, title: quote.title, status: quote.status, totalCents: quote.total_cents } : null,
    planningEventId: row.planning_event_id,
    planningEvent: planningEvent ? { title: planningEvent.title, startsAt: planningEvent.starts_at } : null,
    assignedUserId: row.assigned_user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return <Card>
    <Link href={`/app/${companySlug}/field-service`} className="text-sm text-slate-600 underline underline-offset-4">← Terug naar werkbonnen</Link>
    <div className="mt-4"><WorkOrderDetail companyId={company.id} workOrder={workOrder} currentUserId={user.id} currentUserRole={membership.role} members={memberLabels} products={products ?? []} materials={(materials ?? []).map((item) => { const product = item.product_catalog_items as unknown as { name: string; sku: string | null } | null; return { id: item.id, sourceKind: item.source_kind, productName: product?.name ?? null, sku: product?.sku ?? null, description: item.description_snapshot, unit: item.unit_snapshot, quantity: item.quantity, createdAt: item.created_at }; })} notes={notes ?? []} evidence={(evidence ?? []).map((item) => { const document = item.documents as unknown as { original_filename: string; mime_type: string } | null; return { id: item.id, evidenceType: item.evidence_type, filename: document?.original_filename ?? "Bestand", mimeType: document?.mime_type ?? "", createdAt: item.created_at }; })} signoff={signoffs ? { id: signoffs.id, customerName: signoffs.customer_name, confirmationMethod: signoffs.confirmation_method, createdAt: signoffs.created_at } : null} /></div>
  </Card>;
}
