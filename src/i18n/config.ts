export const supportedLanguages = ["nl", "en", "de", "es"] as const;
export const supportedLocales = ["nl-NL", "en-GB", "de-DE", "es-ES"] as const;

export type SupportedLanguage = typeof supportedLanguages[number];
export type SupportedLocale = typeof supportedLocales[number];
export type SupportedCurrency = "EUR";

export const defaultLanguage: SupportedLanguage = "nl";
export const defaultLocale: SupportedLocale = "nl-NL";
export const defaultCurrency: SupportedCurrency = "EUR";

const localeByLanguage: Record<SupportedLanguage, SupportedLocale> = {
  nl: "nl-NL",
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage);
}

export function resolveProductLanguage(language?: SupportedLanguage): SupportedLanguage {
  return language === "nl" ? language : defaultLanguage;
}

export function resolveProductLocale(language?: SupportedLanguage): SupportedLocale {
  return localeByLanguage[resolveProductLanguage(language)];
}
