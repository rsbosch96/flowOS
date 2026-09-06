"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { aicsIntentLabel, aicsOwnershipLabel, type AicsIntent, type AicsOwnershipState } from "@/features/ai-customer-service/ui";

export type ConversationOverviewRow = {
  id: string;
  subject: string | null;
  customerName: string;
  channel: string;
  status: string;
  statusLabel: string;
  lastActivityLabel: string | null;
  aicsState: AicsOwnershipState | null;
  aicsIntent: AicsIntent | null;
  reviewNeeded: boolean;
};

type Props = { companySlug: string; rows: ConversationOverviewRow[]; aicsAvailable: boolean };
type Filter = "all" | "review" | "human" | "open" | "resolved";

const filterLabels: Record<Filter, string> = { all: "Alle", review: "Beoordeling nodig", human: "Menselijke overname", open: "Open", resolved: "Afgehandeld" };

export function ConversationFilters({ companySlug, rows, aicsAvailable }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const visibleRows = useMemo(() => rows.filter((row) => {
    if (filter === "review") return row.reviewNeeded;
    if (filter === "human") return row.aicsState === "human_owned";
    if (filter === "open") return row.status !== "resolved";
    if (filter === "resolved") return row.status === "resolved";
    return true;
  }), [filter, rows]);

  return <>
    {aicsAvailable && <div className="mt-5 flex flex-wrap gap-2" aria-label="Gesprekken filteren">
      {(Object.keys(filterLabels) as Filter[]).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-full border px-3 py-1.5 text-sm ${filter === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{filterLabels[value]}</button>)}
    </div>}
    <div className="mt-6 divide-y">
      {visibleRows.map((conversation) => <Link href={`/app/${companySlug}/conversations/${conversation.id}`} key={conversation.id} className="block rounded-md px-2 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{conversation.subject ?? "Zonder onderwerp"}</p>
            <p className="text-sm text-slate-600">{conversation.customerName} · {conversation.channel}</p>
            {aicsAvailable && <p className="mt-1 text-xs text-slate-600">AI: {aicsOwnershipLabel(conversation.aicsState)} · {aicsIntentLabel(conversation.aicsIntent)}{conversation.reviewNeeded ? " · Beoordeling nodig" : ""}</p>}
          </div>
          <div className="text-right text-sm text-slate-600"><p>{conversation.statusLabel}</p>{conversation.lastActivityLabel && <p className="text-xs">{conversation.lastActivityLabel}</p>}</div>
        </div>
      </Link>)}
      {!visibleRows.length && <p className="py-8 text-sm text-slate-600">Geen gesprekken voor deze filter.</p>}
    </div>
  </>;
}
