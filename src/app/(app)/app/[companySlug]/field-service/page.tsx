import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { WorkOrderList, type WorkOrderListData } from "@/features/field-service/components/work-order-list";
import { fieldServiceModule } from "@/lib/entitlements/modules";
import { resolveCompanyModuleAccess } from "@/lib/entitlements/server";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ companySlug: string }>; searchParams: Promise<{ quoteId?: string }> };

export default async function FieldServicePage({ params, searchParams }: Props) {
  const { companySlug } = await params;
  const { quoteId } = await searchParams;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id,name,slug").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle();
  if (!membership || await resolveCompanyModuleAccess(supabase, company.id, fieldServiceModule) !== "MODULE_AVAILABLE") notFound();

  const [{ data: workOrders }, { data: customers }, { data: quotes }, { data: planningEvents }, { data: memberships }] = await Promise.all([
    supabase.from("field_service_work_orders").select("id,title,description,status,customer_id,quote_id,planning_event_id,assigned_user_id,created_at,updated_at,customers(name)").eq("company_id", company.id).order("updated_at", { ascending: false }).limit(100),
    supabase.from("customers").select("id,name").eq("company_id", company.id).order("name").limit(200),
    supabase.from("quotes").select("id,quote_number,title,status,customer_id").eq("company_id", company.id).eq("status", "accepted").order("created_at", { ascending: false }).limit(200),
    supabase.from("planning_events").select("id,title,starts_at,status").eq("company_id", company.id).eq("status", "scheduled").order("starts_at").limit(200),
    supabase.from("company_memberships").select("user_id,role,users(full_name,email)").eq("company_id", company.id),
  ]);

  const memberLabels = (memberships ?? []).map((entry) => {
    const account = entry.users as unknown as { full_name: string | null; email: string } | null;
    return { id: entry.user_id, role: entry.role, label: account?.full_name || account?.email || "Gebruiker" };
  });
  const customerLabels = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));
  const listData: WorkOrderListData[] = (workOrders ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    customerId: row.customer_id,
    customerName: customerLabels.get(row.customer_id) ?? "Onbekende klant",
    quoteId: row.quote_id,
    planningEventId: row.planning_event_id,
    assignedUserId: row.assigned_user_id,
    assignedUserName: memberLabels.find((member) => member.id === row.assigned_user_id)?.label ?? null,
    updatedAt: row.updated_at,
  }));

  const preselectedQuote = quoteId ? (quotes ?? []).find((quote) => quote.id === quoteId) ?? null : null;
  const canManage = membership.role === "owner" || membership.role === "employee";

  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-blue-700">Field Service</p>
        <h1 className="mt-1 text-2xl font-semibold">Werkbonnen</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Maak werk op locatie concreet, wijs het toe en volg de uitvoering stap voor stap.</p>
      </div>
      <Link href={`/app/${companySlug}`} className="text-sm text-slate-600 underline underline-offset-4">Terug naar dashboard</Link>
    </div>
    <div className="mt-6">
      <WorkOrderList
        companyId={company.id}
        companySlug={companySlug}
        workOrders={listData}
        customers={customers ?? []}
        quotes={(quotes ?? []).map((quote) => ({ id: quote.id, quoteNumber: quote.quote_number, title: quote.title, customerId: quote.customer_id }))}
        planningEvents={planningEvents ?? []}
        members={memberLabels}
        canManage={canManage}
        preselectedQuote={preselectedQuote ? { id: preselectedQuote.id, quoteNumber: preselectedQuote.quote_number, title: preselectedQuote.title, customerId: preselectedQuote.customer_id } : null}
      />
    </div>
  </Card>;
}
