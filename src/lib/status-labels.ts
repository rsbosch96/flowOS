type SupportedLanguage = "nl" | "en" | "es" | "de";
function resolveProductLanguage(language?: SupportedLanguage | string | null): SupportedLanguage {
  const value = String(language ?? "nl").toLowerCase().split(/[-_]/)[0];
  return value === "en" || value === "es" || value === "de" ? value : "nl";
}

const quoteStatusLabels: Record<SupportedLanguage, Record<string, string>> = {
  nl: {
  draft: "Concept",
  approved: "Goedgekeurd",
  sent: "Verzonden",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
  },
  en: { draft: "Draft", approved: "Approved", sent: "Sent", accepted: "Accepted", rejected: "Rejected" },
  es: { draft: "Borrador", approved: "Aprobado", sent: "Enviado", accepted: "Aceptado", rejected: "Rechazado" },
  de: { draft: "Entwurf", approved: "Genehmigt", sent: "Versendet", accepted: "Angenommen", rejected: "Abgelehnt" },
};

const invoiceStatusLabels: Record<SupportedLanguage, Record<string, string>> = {
 nl: {
  draft: "Concept",
  sent: "Verzonden",
  overdue: "Verlopen",
  paid: "Betaald",
  void: "Geannuleerd",
 },
 en: { draft: "Draft", sent: "Sent", overdue: "Overdue", paid: "Paid", void: "Voided" },
 es: { draft: "Borrador", sent: "Enviada", overdue: "Vencida", paid: "Pagada", void: "Anulada" },
 de: { draft: "Entwurf", sent: "Versendet", overdue: "Überfällig", paid: "Bezahlt", void: "Storniert" },
};

const conversationStatusLabels: Record<SupportedLanguage, Record<string, string>> = {
 nl: {
  open: "Open",
  pending: "In behandeling",
  resolved: "Afgerond",
  archived: "Gearchiveerd",
 }, en: { open: "Open", pending: "Pending", resolved: "Resolved", archived: "Archived" }, es: { open: "Abierta", pending: "En curso", resolved: "Resuelta", archived: "Archivada" }, de: { open: "Offen", pending: "In Bearbeitung", resolved: "Abgeschlossen", archived: "Archiviert" },
};

const taskStatusLabels: Record<SupportedLanguage, Record<string, string>> = {
 nl: {
  todo: "Te doen",
  in_progress: "Bezig",
  blocked: "Geblokkeerd",
  done: "Afgerond",
 }, en: { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" }, es: { todo: "Pendiente", in_progress: "En curso", blocked: "Bloqueada", done: "Completada" }, de: { todo: "Offen", in_progress: "In Bearbeitung", blocked: "Blockiert", done: "Erledigt" },
};

function statusLabel(labels: Record<SupportedLanguage, Record<string, string>>, status: string, language?: SupportedLanguage | string | null) {
  const selected = labels[resolveProductLanguage(language)];
  return selected[status] ?? (resolveProductLanguage(language) === "nl" ? "Onbekende status" : "Unknown status");
}

export function quoteStatusLabel(status: string, language?: SupportedLanguage | string | null) {
  return statusLabel(quoteStatusLabels, status, language);
}

export function invoiceStatusLabel(status: string, language?: SupportedLanguage | string | null) {
  return statusLabel(invoiceStatusLabels, status, language);
}

export function conversationStatusLabel(status: string, language?: SupportedLanguage | string | null) {
  return statusLabel(conversationStatusLabels, status, language);
}

export function taskStatusLabel(status: string, language?: SupportedLanguage | string | null) {
  return statusLabel(taskStatusLabels, status, language);
}

export type InvoiceStatusAction = "sent" | "paid" | "void";

// Presentation-only mapping. The database RPC remains the authority for every transition.
export function availableInvoiceStatusActions(status: string): InvoiceStatusAction[] {
  if (status === "draft") return ["sent", "void"];
  if (status === "sent" || status === "overdue") return ["paid", "void"];
  return [];
}
