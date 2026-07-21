import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { CatalogForm } from "@/features/catalog/components/catalog-form";

export default async function CatalogPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params; const supabase = await createClient(); const { data: company } = await supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle(); if (!company) notFound();
  const { data: products } = await supabase.from("product_catalog_items").select("id,name,sku,unit,default_unit_price_cents,default_vat_rate").eq("company_id", company.id).eq("is_active", true).order("name");
  return <Card><h1 className="text-xl font-semibold">Productcatalogus</h1><p className="mt-1 text-sm text-slate-600">Vaste materiaal- en arbeidsprijzen voor controleerbare offertes.</p><CatalogForm companyId={company.id} /><div className="mt-6 divide-y">{products?.map((product) => <div key={product.id} className="flex justify-between py-3"><div><p className="font-medium">{product.name}</p><p className="text-sm text-slate-600">{product.sku ?? "Geen artikelcode"} · {product.unit} · {product.default_vat_rate}% btw</p></div><p className="font-medium">€ {(product.default_unit_price_cents / 100).toFixed(2).replace(".", ",")}</p></div>)}{!products?.length && <p className="py-8 text-sm text-slate-600">Nog geen producten. Voeg eerst je meest gebruikte materialen en werkzaamheden toe.</p>}</div></Card>;
}
