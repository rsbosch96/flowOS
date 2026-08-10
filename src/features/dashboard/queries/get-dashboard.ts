import { createClient } from "@/lib/supabase/server";

export type DashboardData = { company: { id: string; name: string; slug: string }; requests: number; quotes: number; openTasks: number; aiRuns: number; setup: { companyProfileComplete: boolean; hasCatalogProduct: boolean; hasRequest: boolean } };

export async function getDashboard(companySlug: string): Promise<DashboardData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: company } = await supabase.from("companies").select("id,name,slug,kvk_number,vat_number,iban,address").eq("slug", companySlug).maybeSingle();
  if (!company) return null;
  const [conversations, quotes, tasks, aiRuns, catalogProducts] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", company.id).in("status", ["open", "pending"]),
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", company.id).in("status", ["todo", "in_progress", "blocked"]),
    supabase.from("ai_runs").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "succeeded"),
    supabase.from("product_catalog_items").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("is_active", true),
  ]);
  const address = asObject(company.address);
  const companyProfileComplete = [company.kvk_number, company.vat_number, company.iban, address.street, address.postal_code, address.city, address.country].every((value) => typeof value === "string" && value.trim().length > 0);
  return { company: { id: company.id, name: company.name, slug: company.slug }, requests: conversations.count ?? 0, quotes: quotes.count ?? 0, openTasks: tasks.count ?? 0, aiRuns: aiRuns.count ?? 0, setup: { companyProfileComplete, hasCatalogProduct: (catalogProducts.count ?? 0) > 0, hasRequest: (conversations.count ?? 0) > 0 } };
}

function asObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
