export type AicsOwnershipState = "ai_assisted" | "needs_review" | "human_owned" | "resolved";
export type AicsEscalationState = "none" | "needs_review" | "escalated";
export type AicsReviewStatus = "draft" | "approved" | "rejected";
export type AicsIntent =
  | "general_question"
  | "product_service_question"
  | "quote_question"
  | "appointment_question"
  | "complaint"
  | "billing_question"
  | "technical_support"
  | "human_requested"
  | "privacy"
  | "legal"
  | "security"
  | "account_changes"
  | "unknown";

export const aicsIntentLabels: Record<AicsIntent, string> = {
  general_question: "Algemene vraag",
  product_service_question: "Vraag over product of dienst",
  quote_question: "Vraag over offerte",
  appointment_question: "Afspraak",
  complaint: "Klacht",
  billing_question: "Factuurvraag",
  technical_support: "Technische vraag",
  human_requested: "Mens gevraagd",
  privacy: "Privacy",
  legal: "Juridisch",
  security: "Accountbeveiliging",
  account_changes: "Accountwijziging",
  unknown: "Onbekend",
};

export const aicsOwnershipLabels: Record<AicsOwnershipState, string> = {
  ai_assisted: "AI ondersteunt",
  needs_review: "Beoordeling nodig",
  human_owned: "Overgenomen door medewerker",
  resolved: "Afgehandeld",
};

export const aicsEscalationLabels: Record<AicsEscalationState, string> = {
  none: "Geen escalatie",
  needs_review: "Menselijke beoordeling vereist",
  escalated: "Geëscaleerd naar medewerker",
};

export const aicsReviewLabels: Record<AicsReviewStatus, string> = {
  draft: "AI-concept",
  approved: "Concept goedgekeurd",
  rejected: "Concept afgewezen",
};

export function aicsIntentLabel(value: string | null | undefined) {
  return value && value in aicsIntentLabels ? aicsIntentLabels[value as AicsIntent] : aicsIntentLabels.unknown;
}

export function aicsOwnershipLabel(value: string | null | undefined) {
  return value && value in aicsOwnershipLabels ? aicsOwnershipLabels[value as AicsOwnershipState] : "Nog geen AI-analyse";
}

export function aicsEscalationLabel(value: string | null | undefined) {
  return value && value in aicsEscalationLabels ? aicsEscalationLabels[value as AicsEscalationState] : aicsEscalationLabels.none;
}
