import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ filename: z.string().min(1).max(255), mimeType: z.string().min(3).max(100), byteSize: z.number().int().positive().max(25 * 1024 * 1024), customerId: z.string().uuid().optional() });
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]);
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const input = schema.safeParse(await request.json()); if (!input.success || !allowed.has(input.data.mimeType)) return NextResponse.json({ error: { message: "Bestandstype of grootte is niet toegestaan." } }, { status: 400 });
  const { companyId } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: company } = await supabase.from("companies").select("id").eq("id", companyId).maybeSingle(); if (!company) return NextResponse.json({ error: { message: "Geen toegang." } }, { status: 403 });
  const documentId = crypto.randomUUID(); const safeName = input.data.filename.replace(/[^a-zA-Z0-9._-]/g, "_"); const path = `${companyId}/${documentId}/${safeName}`;
  const { error: insertError } = await supabase.from("documents").insert({ id: documentId, company_id: companyId, customer_id: input.data.customerId ?? null, uploaded_by: user.id, storage_path: path, original_filename: input.data.filename, mime_type: input.data.mimeType, byte_size: input.data.byteSize });
  if (insertError) return NextResponse.json({ error: { message: "Document kon niet worden geregistreerd." } }, { status: 500 });
  const { data, error } = await supabase.storage.from("company-documents").createSignedUploadUrl(path);
  if (error || !data) { await supabase.from("documents").delete().eq("id", documentId); return NextResponse.json({ error: { message: "Upload kon niet worden voorbereid." } }, { status: 500 }); }
  return NextResponse.json({ documentId, path, token: data.token, signedUrl: data.signedUrl }, { status: 201 });
}
