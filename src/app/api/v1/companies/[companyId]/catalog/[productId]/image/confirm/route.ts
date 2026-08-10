import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ path: z.string().min(1).max(500) });
const maxBytes = 5 * 1024 * 1024;

function detectedMimeType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; productId: string }> }) {
  const input = schema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { message: "Ongeldige afbeeldingsupload." } }, { status: 400 });
  const { companyId, productId } = await params;
  const expectedPrefix = `${companyId}/catalog/${productId}/`;
  if (!input.data.path.startsWith(expectedPrefix)) return NextResponse.json({ error: { message: "Ongeldig afbeeldingspad." } }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: member } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!member || member.role === "technician") return NextResponse.json({ error: { message: "Je mag de catalogus niet beheren." } }, { status: 403 });
  const { data: product } = await supabase.from("product_catalog_items").select("image_storage_path").eq("id", productId).eq("company_id", companyId).maybeSingle();
  if (!product) return NextResponse.json({ error: { message: "Product niet gevonden." } }, { status: 404 });
  const { data: blob, error: downloadError } = await supabase.storage.from("company-images").download(input.data.path);
  if (downloadError || !blob || blob.size > maxBytes || !detectedMimeType(new Uint8Array(await blob.arrayBuffer()))) {
    await supabase.storage.from("company-images").remove([input.data.path]);
    return NextResponse.json({ error: { message: "De geüploade afbeelding is geen geldige PNG of JPEG." } }, { status: 400 });
  }
  const { error: updateError } = await supabase.from("product_catalog_items").update({ image_storage_path: input.data.path, updated_at: new Date().toISOString() }).eq("id", productId).eq("company_id", companyId);
  if (updateError) {
    await supabase.storage.from("company-images").remove([input.data.path]);
    return NextResponse.json({ error: { message: "Afbeelding kon niet aan het product worden gekoppeld." } }, { status: 500 });
  }
  if (product.image_storage_path && product.image_storage_path !== input.data.path) await supabase.storage.from("company-images").remove([product.image_storage_path]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ companyId: string; productId: string }> }) {
  const { companyId, productId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { message: "Log opnieuw in." } }, { status: 401 });
  const { data: member } = await supabase.from("company_memberships").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!member || member.role === "technician") return NextResponse.json({ error: { message: "Je mag de catalogus niet beheren." } }, { status: 403 });
  const { data: product } = await supabase.from("product_catalog_items").select("image_storage_path").eq("id", productId).eq("company_id", companyId).maybeSingle();
  if (!product) return NextResponse.json({ error: { message: "Product niet gevonden." } }, { status: 404 });
  const { error } = await supabase.from("product_catalog_items").update({ image_storage_path: null, updated_at: new Date().toISOString() }).eq("id", productId).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: { message: "Afbeelding kon niet worden verwijderd." } }, { status: 500 });
  if (product.image_storage_path) await supabase.storage.from("company-images").remove([product.image_storage_path]);
  return NextResponse.json({ ok: true });
}
