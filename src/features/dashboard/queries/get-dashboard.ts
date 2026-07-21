import { createClient } from "@/lib/supabase/server";

export type DashboardData = { company: { id: string; name: string; slug: string }; requests: number; quotes: number; openTasks: number; aiRuns: number };

export async function getDashboard(companySlug: string): Promise<DashboardData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: company } = await supabase.from("companies").select("id,name,slug").eq("slug", companySlug).maybeSingle();
  if (!company) return null;
  const [conversations, quotes, tasks, aiRuns] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("company_id", company.id).in("status", ["open", "pending"]),
    supabase.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", company.id).in("status", ["todo", "in_progress", "blocked"]),
    supabase.from("ai_runs").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "succeeded"),
  ]);
  return { company, requests: conversations.count ?? 0, quotes: quotes.count ?? 0, openTasks: tasks.count ?? 0, aiRuns: aiRuns.count ?? 0 };
}
