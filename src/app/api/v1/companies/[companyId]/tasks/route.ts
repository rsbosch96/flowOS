import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).optional(), priority: z.enum(["low", "normal", "high", "urgent"]), dueAt: z.string().date().optional() });
const updateSchema = z.object({ taskId: z.string().uuid(), status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]).optional(), description: z.string().trim().max(2000).nullable().optional() }).refine((value) => value.status !== undefined || value.description !== undefined, { message: "Geen wijziging opgegeven." });

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const input = createSchema.safeParse(await request.json()); if (!input.success) return NextResponse.json({ error: { message: "Controleer titel en deadline." } }, { status: 400 });
  const { companyId } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen taken aanmaken." } }, { status: 403 });
  const { error } = await supabase.from("tasks").insert({ company_id: companyId, title: input.data.title, description: input.data.description || null, priority: input.data.priority, due_at: input.data.dueAt || null, created_by: user.id });
  if (error) return NextResponse.json({ error: { message: "Taak kon niet worden opgeslagen." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const input = updateSchema.safeParse(await request.json()); if (!input.success) return NextResponse.json({ error: { message: "Ongeldige taakstatus." } }, { status: 400 });
  const { companyId } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const changes: { status?: string; completed_at?: string | null; description?: string | null } = {};
  if (input.data.status) { changes.status = input.data.status; changes.completed_at = input.data.status === "done" ? new Date().toISOString() : null; }
  if (input.data.description !== undefined) changes.description = input.data.description || null;
  const { error } = await supabase.from("tasks").update(changes).eq("id", input.data.taskId).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: { message: "Taakstatus kon niet worden bijgewerkt." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const taskId = new URL(request.url).searchParams.get("taskId"); if (!taskId || !z.string().uuid().safeParse(taskId).success) return NextResponse.json({ error: { message: "Ongeldige taak." } }, { status: 400 });
  const { companyId } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: membership } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!membership || membership.role === "technician") return NextResponse.json({ error: { message: "Je mag geen taken verwijderen." } }, { status: 403 });
  const { error } = await supabase.from("tasks").delete().eq("id", taskId).eq("company_id", companyId); if (error) return NextResponse.json({ error: { message: "Taak kon niet worden verwijderd." } }, { status: 500 });
  return NextResponse.json({ ok: true });
}
