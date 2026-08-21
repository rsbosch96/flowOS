import { getTranslations, type TranslationKey } from "../../../i18n/get-translations.ts";
import type { SupportedLanguage } from "../../../i18n/config.ts";

type AuthErrorLike = { code?: string | null; status?: number | null; message?: string | null } | null | undefined;

export function registrationErrorKey(error: AuthErrorLike): TranslationKey {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  if (error?.status === 429 || code.includes("rate") || message.includes("rate limit") || message.includes("too many")) return "auth.rateLimit";
  if (code.includes("weak") || code.includes("password") && (message.includes("weak") || message.includes("leak")) || message.includes("password") && (message.includes("weak") || message.includes("compromised") || message.includes("leaked"))) return "auth.weakPassword";
  if (code.includes("user_already") || code.includes("already") || message.includes("already registered") || message.includes("already exists")) return "auth.accountConflict";
  return "auth.registrationFailed";
}

export function mapRegistrationError(error: AuthErrorLike, language?: SupportedLanguage): string {
  return getTranslations(language).t(registrationErrorKey(error));
}
