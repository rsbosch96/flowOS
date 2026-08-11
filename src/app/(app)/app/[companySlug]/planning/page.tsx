import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PlanningManager, type PlanningEvent } from "@/features/planning/components/planning-manager";
import { planningModule } from "@/lib/entitlements/modules";
import { hasCompanyModule } from "@/lib/entitlements/server";
import { createClient } from "@/lib/supabase/server";

type Row = Omit<PlanningEvent, "customer_name" | "assignee_name">;

export default async function PlanningPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle();
  if (!membership) notFound();
  if (!await hasCompanyModule(supabase, company.id, planningModule)) notFound();

  const [{ data: rows }, { data: customers }, { data: memberships }] = await Promise.all([
    supabase.from("planning_events").select("id,title,description,event_type,starts_at,ends_at,all_day,status,location,assigned_user_id,customer_id,source_type").eq("company_id", company.id).order("starts_at", { ascending: true }).limit(100),
    supabase.from("customers").select("id,name").eq("company_id", company.id).order("name").limit(200),
    supabase.from("company_memberships").select("user_id,users(full_name,email)").eq("company_id", company.id),
  ]);

  const memberLabels = new Map<string, string>();
  for (const entry of memberships ?? []) {
    const account = entry.users as unknown as { full_name: string | null; email: string } | null;
    memberLabels.set(entry.user_id, account?.full_name || account?.email || "Gebruiker");
  }
  const customerLabels = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));
  const events = (rows ?? []).map((row) => ({
    ...(row as Row),
    customer_name: row.customer_id ? customerLabels.get(row.customer_id) ?? null : null,
    assignee_name: row.assigned_user_id ? memberLabels.get(row.assigned_user_id) ?? null : null,
  })) as PlanningEvent[];

  return <Card><h1 className="text-xl font-semibold">Planning</h1><p className="mt-1 text-sm text-slate-600">Plan afspraken, werkzaamheden en leveringen per organisatie.</p><div className="mt-6"><PlanningManager companyId={company.id} events={events} customers={customers ?? []} members={[...memberLabels].map(([id, label]) => ({ id, label }))} canManage={membership.role === "owner" || membership.role === "employee"} /></div></Card>;
}
