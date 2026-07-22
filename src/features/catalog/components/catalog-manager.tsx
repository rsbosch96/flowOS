"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Check, ImagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/i18n/formatters";
import { getTranslations } from "@/i18n/get-translations";

type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string;
  default_unit_price_cents: number;
  default_vat_rate: number;
  is_active: boolean;
  image_storage_path: string | null;
  imageUrl: string | null;
};

type Draft = { name: string; description: string; sku: string; unit: string; price: string; vatRate: string };
const toDraft = (product: CatalogProduct): Draft => ({ name: product.name, description: product.description ?? "", sku: product.sku ?? "", unit: product.unit, price: (product.default_unit_price_cents / 100).toFixed(2).replace(".", ","), vatRate: String(product.default_vat_rate) });
const emptyDraft: Draft = { name: "", description: "", sku: "", unit: "stuk", price: "", vatRate: "21" };

export function CatalogManager({ companyId, products }: { companyId: string; products: CatalogProduct[] }) {
  const router = useRouter();
  const { t } = getTranslations();
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const visibleProducts = useMemo(() => products.filter((product) => showArchived ? !product.is_active : product.is_active), [products, showArchived]);

  function payload(value: Draft) {
    return { name: value.name, description: value.description || null, sku: value.sku || null, unit: value.unit, priceCents: Math.round(Number(value.price.replace(",", ".")) * 100), vatRate: Number(value.vatRate) };
  }
  function validDraft(value: Draft) { return value.name.trim().length >= 2 && value.unit.trim().length > 0 && Number.isFinite(Number(value.price.replace(",", "."))) && Number(value.price.replace(",", ".")) >= 0 && Number.isFinite(Number(value.vatRate)); }
  async function request(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? t("catalog.saveFailed"));
    return data;
  }
  async function addProduct(event: FormEvent) {
    event.preventDefault();
    if (!validDraft(draft)) return setMessage(t("catalog.invalidProduct"));
    setPending(true); setMessage(undefined);
    try { await request(`/api/v1/companies/${companyId}/catalog`, "POST", payload(draft)); setDraft(emptyDraft); setMessage(t("catalog.created")); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("catalog.saveFailed")); }
    finally { setPending(false); }
  }
  async function saveProduct(productId: string) {
    if (!validDraft(draft)) return setMessage(t("catalog.invalidProduct"));
    setPending(true); setMessage(undefined);
    try { await request(`/api/v1/companies/${companyId}/catalog/${productId}`, "PATCH", payload(draft)); setEditingId(undefined); setMessage(t("catalog.updated")); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("catalog.saveFailed")); }
    finally { setPending(false); }
  }
  async function setActive(product: CatalogProduct, isActive: boolean) {
    if (!isActive && !window.confirm(t("catalog.archiveConfirm"))) return;
    setPending(true); setMessage(undefined);
    try { await request(`/api/v1/companies/${companyId}/catalog/${product.id}`, "PATCH", { isActive }); setMessage(isActive ? t("catalog.reactivated") : t("catalog.archived")); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("catalog.saveFailed")); }
    finally { setPending(false); }
  }
  async function uploadImage(product: CatalogProduct, file: File) {
    setPending(true); setMessage(undefined);
    try {
      const prepared = await request(`/api/v1/companies/${companyId}/catalog/${product.id}/image/upload-url`, "POST", { filename: file.name, mimeType: file.type, byteSize: file.size }) as { path: string; signedUrl: string };
      const upload = await fetch(prepared.signedUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!upload.ok) throw new Error(t("catalog.imageUploadFailed"));
      await request(`/api/v1/companies/${companyId}/catalog/${product.id}/image/confirm`, "POST", { path: prepared.path });
      setMessage(t("catalog.imageUpdated")); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("catalog.imageUploadFailed")); }
    finally { setPending(false); }
  }
  async function removeImage(product: CatalogProduct) {
    if (!window.confirm(t("catalog.removeImageConfirm"))) return;
    setPending(true); setMessage(undefined);
    try { await request(`/api/v1/companies/${companyId}/catalog/${product.id}/image/confirm`, "DELETE"); setMessage(t("catalog.imageRemoved")); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("catalog.saveFailed")); }
    finally { setPending(false); }
  }

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-xl font-semibold">{t("catalog.title")}</h1><p className="mt-1 text-sm text-slate-600">{t("catalog.description")}</p></div><div className="flex rounded-md border p-1 text-sm"><button type="button" onClick={() => setShowArchived(false)} className={`rounded px-3 py-1.5 ${!showArchived ? "bg-slate-900 text-white" : "text-slate-700"}`}>{t("catalog.active")}</button><button type="button" onClick={() => setShowArchived(true)} className={`rounded px-3 py-1.5 ${showArchived ? "bg-slate-900 text-white" : "text-slate-700"}`}>{t("catalog.archived")}</button></div></div>
    <form onSubmit={addProduct} className="mt-5 grid gap-3 rounded-lg border bg-slate-50 p-4 sm:grid-cols-6"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required placeholder={t("catalog.namePlaceholder")} className="rounded border bg-white px-3 py-2 text-sm sm:col-span-2" /><input value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} placeholder={t("catalog.skuPlaceholder")} className="rounded border bg-white px-3 py-2 text-sm" /><input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} required className="rounded border bg-white px-3 py-2 text-sm" /><input value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} required inputMode="decimal" placeholder={t("catalog.pricePlaceholder")} className="rounded border bg-white px-3 py-2 text-sm" /><label className="rounded border bg-white px-3 py-2 text-sm">{t("catalog.vatRate")}<input value={draft.vatRate} onChange={(event) => setDraft({ ...draft, vatRate: event.target.value })} required type="number" min="0" max="100" className="ml-1 w-12" /></label><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t("catalog.descriptionPlaceholder")} className="min-h-20 rounded border bg-white px-3 py-2 text-sm sm:col-span-5" /><div className="flex items-end"><Button type="submit" disabled={pending}>{t("catalog.add")}</Button></div></form>
    {message && <p className="mt-3 text-sm text-slate-700" role="status">{message}</p>}
    <div className="mt-6 divide-y">{visibleProducts.map((product) => <div key={product.id} className="py-4">{editingId === product.id ? <ProductEditor draft={draft} pending={pending} onChange={setDraft} onSave={() => saveProduct(product.id)} onCancel={() => setEditingId(undefined)} t={t} /> : <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-50 text-slate-400">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={20} />}</div><div><p className="font-medium">{product.name}</p>{product.description && <p className="mt-1 text-sm text-slate-600">{product.description}</p>}<p className="mt-1 text-sm text-slate-600">{product.sku ?? t("catalog.noSku")} · {product.unit} · {product.default_vat_rate}% {t("catalog.vat")}</p></div></div><div className="flex flex-wrap items-center justify-end gap-2"><p className="mr-2 font-medium">{formatMoney(product.default_unit_price_cents)}</p><label className="cursor-pointer rounded border px-3 py-2 text-sm hover:bg-slate-50"><ImagePlus size={15} className="mr-1 inline" />{t("catalog.uploadImage")}<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(product, file); event.currentTarget.value = ""; }} /></label>{product.image_storage_path && <button type="button" onClick={() => void removeImage(product)} className="rounded border px-3 py-2 text-sm hover:bg-slate-50"><Trash2 size={15} className="mr-1 inline" />{t("catalog.removeImage")}</button>}<button type="button" onClick={() => { setDraft(toDraft(product)); setEditingId(product.id); }} className="rounded border px-3 py-2 text-sm hover:bg-slate-50"><Pencil size={15} className="mr-1 inline" />{t("catalog.edit")}</button><button type="button" onClick={() => void setActive(product, !product.is_active)} className="rounded border px-3 py-2 text-sm hover:bg-slate-50">{product.is_active ? <><Archive size={15} className="mr-1 inline" />{t("catalog.archive")}</> : <><RotateCcw size={15} className="mr-1 inline" />{t("catalog.reactivate")}</>}</button></div></div>}</div>)}{!visibleProducts.length && <p className="py-8 text-sm text-slate-600">{showArchived ? t("catalog.noArchived") : t("catalog.empty")}</p>}</div>
  </div>;
}

function ProductEditor({ draft, pending, onChange, onSave, onCancel, t }: { draft: Draft; pending: boolean; onChange: (draft: Draft) => void; onSave: () => void; onCancel: () => void; t: ReturnType<typeof getTranslations>["t"] }) {
  return <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2"><label className="text-sm">{t("catalog.name")}<input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} className="mt-1 w-full rounded border bg-white px-3 py-2" /></label><label className="text-sm">{t("catalog.sku")}<input value={draft.sku} onChange={(event) => onChange({ ...draft, sku: event.target.value })} className="mt-1 w-full rounded border bg-white px-3 py-2" /></label><label className="text-sm">{t("catalog.unit")}<input value={draft.unit} onChange={(event) => onChange({ ...draft, unit: event.target.value })} className="mt-1 w-full rounded border bg-white px-3 py-2" /></label><label className="text-sm">{t("catalog.price")}<input value={draft.price} inputMode="decimal" onChange={(event) => onChange({ ...draft, price: event.target.value })} className="mt-1 w-full rounded border bg-white px-3 py-2" /></label><label className="text-sm">{t("catalog.vatRate")}<input value={draft.vatRate} type="number" min="0" max="100" onChange={(event) => onChange({ ...draft, vatRate: event.target.value })} className="mt-1 w-full rounded border bg-white px-3 py-2" /></label><div /><label className="text-sm sm:col-span-2">{t("catalog.productDescription")}<textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} className="mt-1 min-h-24 w-full rounded border bg-white px-3 py-2" /></label><div className="flex gap-2 sm:col-span-2"><Button type="button" disabled={pending} onClick={onSave}><Check size={15} className="mr-1" />{t("catalog.save")}</Button><button type="button" onClick={onCancel} className="rounded px-3 py-2 text-sm hover:bg-slate-200">{t("catalog.cancel")}</button></div></div>;
}
