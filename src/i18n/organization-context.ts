import {
  defaultCurrency,
  defaultLanguage,
  defaultLocale,
  resolveProductLanguage,
  resolveProductLocale,
  type SupportedCurrency,
  type SupportedLanguage,
  type SupportedLocale,
} from "./config.ts";

export type OrganizationContext = {
  companyId: string;
  language: SupportedLanguage;
  locale: SupportedLocale;
  currency: SupportedCurrency;
};

export function getOrganizationContext(companyId: string, language?: SupportedLanguage): OrganizationContext {
  const resolvedLanguage = resolveProductLanguage(language ?? defaultLanguage);
  return {
    companyId,
    language: resolvedLanguage,
    locale: resolvedLanguage === defaultLanguage ? defaultLocale : resolveProductLocale(resolvedLanguage),
    currency: defaultCurrency,
  };
}
