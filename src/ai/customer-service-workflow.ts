import {
  classifySupportIntent,
  requiresHumanReview,
  type SupportIntent,
} from "./customer-service.ts";

export const AicsWorkflowErrorCode = {
  NotAvailable: "AICS_NOT_AVAILABLE",
  AccessForbidden: "AICS_ACCESS_FORBIDDEN",
  ConversationNotFound: "AICS_CONVERSATION_NOT_FOUND",
  DraftNotFound: "AICS_DRAFT_NOT_FOUND",
  DraftAlreadyReviewed: "AICS_DRAFT_ALREADY_REVIEWED",
  HumanOwned: "AICS_HUMAN_OWNED",
  ClassificationFailed: "AICS_CLASSIFICATION_FAILED",
  GenerationFailed: "AICS_GENERATION_FAILED",
  InvalidTransition: "AICS_INVALID_TRANSITION",
} as const;

export type AicsWorkflowErrorCode = typeof AicsWorkflowErrorCode[keyof typeof AicsWorkflowErrorCode];

export type ClassificationResult = {
  intent: SupportIntent;
  requiresHumanReview: boolean;
  reasonCategory: string;
};

/**
 * The classifier is intentionally deterministic and has no authority to
 * execute actions. The latest Core message is the only input considered.
 */
export function classifyCustomerMessage(message: string): ClassificationResult {
  const intent = classifySupportIntent(message);
  return {
    intent,
    requiresHumanReview: requiresHumanReview(intent),
    reasonCategory: requiresHumanReview(intent)
      ? (intent === "unknown" ? "unsupported_or_uncertain" : intent)
      : "routine_information",
  };
}

export function canReviewDraft(reviewStatus: string, nextStatus: "approved" | "rejected") {
  return reviewStatus === "draft" && (nextStatus === "approved" || nextStatus === "rejected");
}

export function isHumanEdit(body: string | undefined) {
  return typeof body === "string" && body.trim().length > 0;
}

export function safeAicsMessage(code: AicsWorkflowErrorCode) {
  switch (code) {
    case AicsWorkflowErrorCode.NotAvailable:
      return "AI-klantenservice is momenteel niet beschikbaar.";
    case AicsWorkflowErrorCode.AccessForbidden:
      return "Geen toegang tot AI-klantenservice.";
    case AicsWorkflowErrorCode.ConversationNotFound:
      return "Aanvraag niet gevonden.";
    case AicsWorkflowErrorCode.DraftNotFound:
      return "Antwoordconcept niet gevonden.";
    case AicsWorkflowErrorCode.DraftAlreadyReviewed:
      return "Dit antwoordconcept is al beoordeeld.";
    case AicsWorkflowErrorCode.HumanOwned:
      return "Deze aanvraag is overgedragen aan een medewerker.";
    case AicsWorkflowErrorCode.ClassificationFailed:
      return "De klantvraag kon niet veilig worden geclassificeerd.";
    case AicsWorkflowErrorCode.GenerationFailed:
      return "Het antwoordconcept kon niet veilig worden gemaakt.";
    case AicsWorkflowErrorCode.InvalidTransition:
      return "Deze statusovergang is niet toegestaan.";
  }
}
