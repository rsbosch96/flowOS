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

const conversationStatusLabels: Record<string, string> = {
  open: "Open",
  pending: "In behandeling",
  resolved: "Afgerond",
  archived: "Gearchiveerd",
};

const taskStatusLabels: Record<string, string> = {
  todo: "Te doen",
  in_progress: "Bezig",
  blocked: "Geblokkeerd",
  done: "Afgerond",
};

function statusLabel(labels: Record<string, string>, status: string) {
  return labels[status] ?? "Onbekende status";
}

export function quoteStatusLabel(status: string) {
  return statusLabel(quoteStatusLabels, status);
}

export function invoiceStatusLabel(status: string) {
  return statusLabel(invoiceStatusLabels, status);
}

export function conversationStatusLabel(status: string) {
  return statusLabel(conversationStatusLabels, status);
}

export function taskStatusLabel(status: string) {
  return statusLabel(taskStatusLabels, status);
}

export type InvoiceStatusAction = "sent" | "paid" | "void";

// Presentation-only mapping. The database RPC remains the authority for every transition.
export function availableInvoiceStatusActions(status: string): InvoiceStatusAction[] {
  if (status === "draft") return ["sent", "void"];
  if (status === "sent" || status === "overdue") return ["paid", "void"];
  return [];
}
