import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CatalogManager } from "@/features/catalog/components/catalog-manager";
import { createClient } from "@/lib/supabase/server";
import { getPreferredLanguage } from "@/i18n/server";

export default async function CatalogPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle();
  if (!company) notFound();
  const { data: products } = await supabase
    .from("product_catalog_items")
    .select("id,name,description,sku,unit,default_unit_price_cents,default_vat_rate,is_active,image_storage_path")
    .eq("company_id", company.id)
    .order("name");
  const catalogProducts = await Promise.all((products ?? []).map(async (product) => {
    const { data } = product.image_storage_path
      ? await supabase.storage.from("company-images").createSignedUrl(product.image_storage_path, 60 * 60)
      : { data: null };
    return { ...product, imageUrl: data?.signedUrl ?? null };
  }));

  return <Card><CatalogManager companyId={company.id} products={catalogProducts} language={await getPreferredLanguage()} /></Card>;
}
