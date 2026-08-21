"use client";

import { useEffect, useRef, useState } from "react";
import { languageLabels, resolveProductLocale, supportedLanguages, type SupportedLanguage } from "./config";

function Flag({ language }: { language: SupportedLanguage }) {
  if (language === "nl") return <svg aria-hidden="true" viewBox="0 0 18 12" className="h-3 w-[18px]"><path fill="#ae1c28" d="M0 0h18v4H0z" /><path fill="#fff" d="M0 4h18v4H0z" /><path fill="#21468b" d="M0 8h18v4H0z" /></svg>;
  if (language === "en") return <svg aria-hidden="true" viewBox="0 0 18 12" className="h-3 w-[18px]"><path fill="#012169" d="M0 0h18v12H0z" /><path stroke="#fff" strokeWidth="3" d="M0 0l18 12M18 0L0 12" /><path stroke="#c8102e" strokeWidth="1.4" d="M0 0l18 12M18 0L0 12" /><path stroke="#fff" strokeWidth="4" d="M9 0v12M0 6h18" /><path stroke="#c8102e" strokeWidth="2" d="M9 0v12M0 6h18" /></svg>;
  if (language === "es") return <svg aria-hidden="true" viewBox="0 0 18 12" className="h-3 w-[18px]"><path fill="#aa151b" d="M0 0h18v3H0zM0 9h18v3H0z" /><path fill="#f1bf00" d="M0 3h18v6H0z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 18 12" className="h-3 w-[18px]"><path fill="#000" d="M0 0h18v4H0z" /><path fill="#d00" d="M0 4h18v4H0z" /><path fill="#ffce00" d="M0 8h18v4H0z" /></svg>;
}

export function LanguageSwitcher({ initialLanguage, persistAccount = false }: { initialLanguage: SupportedLanguage; persistAccount?: boolean }) {
  const [language, setLanguage] = useState(initialLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stored = persistAccount ? null : window.localStorage.getItem("flowos-language");
    if (stored && supportedLanguages.includes(stored as SupportedLanguage)) setLanguage(stored as SupportedLanguage);
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);
  async function choose(next: SupportedLanguage) {
    setLanguage(next); setOpen(false);
    window.localStorage.setItem("flowos-language", next);
    document.cookie = `flowos-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = resolveProductLocale(next);
    if (persistAccount) await fetch("/api/v1/profile/language", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: next }) }).catch(() => undefined);
    window.location.reload();
  }
  const active = languageLabels[language];
  return <div ref={ref} className="relative" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" aria-label={`Taal: ${active.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold tracking-wide text-slate-700 shadow-sm outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600"><Flag language={language} />{active.code}</button>
    {open && <div role="menu" className="absolute right-0 z-20 mt-2 w-full min-w-[92px] rounded-md border border-slate-200 bg-white p-1 shadow-lg">{supportedLanguages.map((candidate) => <button key={candidate} type="button" role="menuitem" aria-current={candidate === language ? "true" : undefined} onClick={() => void choose(candidate)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold tracking-wide outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 ${candidate === language ? "bg-slate-100" : ""}`}><Flag language={candidate} />{languageLabels[candidate].code}</button>)}</div>}
  </div>;
}
