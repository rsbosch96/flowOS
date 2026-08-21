export const supportedLanguages = ["nl", "en", "es", "de"] as const;
export const supportedLocales = ["nl-NL", "en-GB", "de-DE", "es-ES"] as const;

export type SupportedLanguage = typeof supportedLanguages[number];
export type SupportedLocale = typeof supportedLocales[number];
export type SupportedCurrency = "EUR";

export const defaultLanguage: SupportedLanguage = "nl";
export const defaultLocale: SupportedLocale = "nl-NL";
export const defaultCurrency: SupportedCurrency = "EUR";

export const languageLabels: Record<SupportedLanguage, { code: string; name: string }> = {
  nl: { code: "NLD", name: "Nederlands" },
  en: { code: "ENG", name: "English" },
  es: { code: "ESP", name: "Español" },
  de: { code: "DEU", name: "Deutsch" },
};

const localeByLanguage: Record<SupportedLanguage, SupportedLocale> = {
  nl: "nl-NL",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage);
}

export function languageFromLocale(value?: string | null): SupportedLanguage | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const language = normalized.split("-")[0];
  return isSupportedLanguage(language) ? language : undefined;
}

export function resolveProductLanguage(language?: SupportedLanguage | string | null): SupportedLanguage {
  return languageFromLocale(language) ?? defaultLanguage;
}

export function resolveProductLocale(language?: SupportedLanguage | string | null): SupportedLocale {
  return localeByLanguage[resolveProductLanguage(language)];
}
