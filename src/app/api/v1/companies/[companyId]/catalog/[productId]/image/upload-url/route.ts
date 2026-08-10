import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestId } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ filename: z.string().trim().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png"]), byteSize: z.number().int().positive().max(5 * 1024 * 1024) });

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; productId: string }> }) {
  const requestId = getRequestId(request);
  const input = schema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { message: "Kies een PNG- of JPEG-afbeelding van maximaal 5 MB." } }, { status: 400 });
  const { companyId, productId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: member } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!member || member.role === "technician") return NextResponse.json({ error: { message: "Je mag de catalogus niet beheren." } }, { status: 403 });
  const { data: product } = await supabase.from("product_catalog_items").select("id").eq("id", productId).eq("company_id", companyId).maybeSingle();
  if (!product) return NextResponse.json({ error: { message: "Product niet gevonden." } }, { status: 404 });
  const rateLimitError = await enforceRateLimit({ policy: "product_image_upload_sign", subjectParts: [user.id, companyId], requestId, route: "/api/v1/companies/:companyId/catalog/:productId/image/upload-url", companyId, actorId: user.id });
  if (rateLimitError) return rateLimitError;

  const extension = input.data.mimeType === "image/png" ? "png" : "jpg";
  const path = `${companyId}/catalog/${productId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from("company-images").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: { message: "Upload kon niet worden voorbereid." } }, { status: 500 });
  return NextResponse.json({ path, signedUrl: data.signedUrl }, { status: 201 });
}
