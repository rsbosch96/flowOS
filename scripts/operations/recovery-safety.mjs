const protectedProjectIds = new Set([
  "ivifmemxvgglvnnarubt",
  "lkmzwhbbffppyiiiyswk",
]);

export const RECOVERY_CONFIRMATION = "I_UNDERSTAND_THIS_IS_A_RECOVERY_ENVIRONMENT";

export class RecoverySafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "RecoverySafetyError";
  }
}

function normalized(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function assertSafeRecoveryTarget({ environmentType, targetProjectId, confirmation }) {
  const target = normalized(targetProjectId);
  if (normalized(environmentType) !== "recovery") {
    throw new RecoverySafetyError("Restore is allowed only when ENVIRONMENT_TYPE is exactly recovery.");
  }
  if (!/^[a-z0-9-]{8,80}$/i.test(target)) {
    throw new RecoverySafetyError("Recovery target project identity is invalid.");
  }
  if (protectedProjectIds.has(target)) {
    throw new RecoverySafetyError("Restore target is a protected production or staging project.");
  }
  if (confirmation !== RECOVERY_CONFIRMATION) {
    throw new RecoverySafetyError("Restore requires the explicit isolated-recovery confirmation.");
  }
  return { environmentType: "recovery", targetProjectId: target };
}

const providerCredentialNames = [
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_CALENDAR_CLIENT_ID",
  "MICROSOFT_CALENDAR_CLIENT_SECRET",
  "N8N_WEBHOOK_SECRET",
  "N8N_WEBHOOK_URL",
];

export function assertRecoveryProviderKillSwitch(environment) {
  if (normalized(environment?.AI_MODE) !== "mock") {
    throw new RecoverySafetyError("Recovery runtime must use AI_MODE=mock.");
  }

  const configuredProviders = providerCredentialNames.filter((name) => normalized(environment?.[name]));
  if (configuredProviders.length > 0) {
    throw new RecoverySafetyError(`Recovery provider credentials are present: ${configuredProviders.join(", ")}.`);
  }

  return { aiMode: "mock", providersDisabled: true };
}

export const protectedRecoveryProjectIds = Object.freeze([...protectedProjectIds]);
