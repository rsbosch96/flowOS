"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CatalogForm({ companyId }: { companyId: string }) {
  const router = useRouter(); const [message, setMessage] = useState<string>(); const [pending, setPending] = useState(false);
  async function submit(formData: FormData) { setPending(true); setMessage(undefined); const response = await fetch(`/api/v1/companies/${companyId}/catalog`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formData.get("name"), sku: formData.get("sku") || null, unit: formData.get("unit"), priceCents: Math.round(Number(String(formData.get("price")).replace(",", ".")) * 100), vatRate: Number(formData.get("vatRate")) }) }); const payload = await response.json() as { error?: { message: string } }; if (!response.ok) { setMessage(payload.error?.message ?? "Opslaan mislukt."); setPending(false); return; } setMessage("Product toegevoegd."); setPending(false); router.refresh(); }
  return <form action={submit} className="mt-5 grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-5"><input name="name" required placeholder="Product of arbeid" className="rounded border bg-white px-3 py-2 text-sm sm:col-span-2" /><input name="sku" placeholder="Artikelcode" className="rounded border bg-white px-3 py-2 text-sm" /><input name="unit" required defaultValue="stuk" className="rounded border bg-white px-3 py-2 text-sm" /><input name="price" required inputMode="decimal" placeholder="Prijs excl." className="rounded border bg-white px-3 py-2 text-sm" /><input name="vatRate" required defaultValue="21" type="number" className="rounded border bg-white px-3 py-2 text-sm" /><div className="sm:col-span-5"><Button type="submit" disabled={pending}>{pending ? "Opslaan…" : "Product toevoegen"}</Button>{message && <span className="ml-3 text-sm text-slate-600">{message}</span>}</div></form>;
}
