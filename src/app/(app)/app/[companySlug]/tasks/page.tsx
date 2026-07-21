import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { TaskManager } from "@/features/tasks/components/task-manager";
export default async function TasksPage({ params }: { params: Promise<{ companySlug: string }> }) { const { companySlug } = await params; const supabase = await createClient(); const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle(); if (!company) notFound(); const { data: tasks } = await supabase.from("tasks").select("id,title,description,status,priority,due_at").eq("company_id", company.id).order("due_at", { ascending: true, nullsFirst: false }); return <Card><h1 className="text-xl font-semibold">Taken</h1><p className="mt-1 text-sm text-slate-600">Plan werk, bewaak deadlines en rond acties af.</p><div className="mt-6"><TaskManager companyId={company.id} tasks={tasks ?? []} /></div></Card>; }
