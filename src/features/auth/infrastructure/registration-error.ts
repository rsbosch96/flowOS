export type RegistrationErrorCategory = "weak_password" | "account_conflict" | "rate_limited" | "unknown";

type AuthErrorLike = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
  message?: unknown;
};

const asLowerText = (value: unknown) => typeof value === "string" ? value.toLowerCase() : "";

export function registrationErrorCategory(error: AuthErrorLike): RegistrationErrorCategory {
  const code = asLowerText(error.code);
  const name = asLowerText(error.name);
  const message = asLowerText(error.message);

  if (
    code === "weak_password" ||
    name === "weakpassworderror" ||
    /(?:weak|leaked|compromised|breached|pwned).{0,40}password|password.{0,40}(?:weak|leaked|compromised|breached|pwned)/.test(message)
  ) return "weak_password";

  if (
    ["user_already_exists", "email_exists", "identity_already_exists"].includes(code) ||
    /already (?:registered|exists)|already been registered/.test(message)
  ) return "account_conflict";

  if (
    error.status === 429 ||
    ["over_request_rate_limit", "over_email_send_rate_limit", "rate_limit_exceeded"].includes(code) ||
    /rate limit|too many requests|too many requests/.test(message)
  ) return "rate_limited";

  return "unknown";
}

export function registrationErrorMessage(error: AuthErrorLike): string {
  switch (registrationErrorCategory(error)) {
    case "weak_password":
      return "Dit wachtwoord kan niet worden gebruikt. Kies een ander sterk wachtwoord.";
    case "account_conflict":
      return "Registreren is niet gelukt. Controleer je gegevens of probeer het later opnieuw.";
    case "rate_limited":
      return "Te veel pogingen. Probeer het later opnieuw.";
    default:
      return "Registreren is niet gelukt. Probeer het opnieuw.";
  }
}
