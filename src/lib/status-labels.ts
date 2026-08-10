const quoteStatusLabels: Record<string, string> = {
  draft: "Concept",
  approved: "Goedgekeurd",
  sent: "Verzonden",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
};

const invoiceStatusLabels: Record<string, string> = {
  draft: "Concept",
  sent: "Verzonden",
  overdue: "Verlopen",
  paid: "Betaald",
  void: "Geannuleerd",
};

export function quoteStatusLabel(status: string) {
  return quoteStatusLabels[status] ?? status;
}

export function invoiceStatusLabel(status: string) {
  return invoiceStatusLabels[status] ?? status;
}

export type InvoiceStatusAction = "sent" | "paid" | "void";

// Presentation-only mapping. The database RPC remains the authority for every transition.
export function availableInvoiceStatusActions(status: string): InvoiceStatusAction[] {
  if (status === "draft") return ["sent", "void"];
  if (status === "sent" || status === "overdue") return ["paid", "void"];
  return [];
}
