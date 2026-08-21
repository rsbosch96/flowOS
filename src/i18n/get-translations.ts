import nlMessages from "./messages/nl.json" with { type: "json" };
import enMessages from "./messages/en.json" with { type: "json" };
import deMessages from "./messages/de.json" with { type: "json" };
import esMessages from "./messages/es.json" with { type: "json" };
import { defaultLanguage, resolveProductLanguage, type SupportedLanguage } from "./config.ts";

const bundles = { nl: nlMessages, en: enMessages, de: deMessages, es: esMessages } as const;
export type TranslationKey = keyof typeof nlMessages;
export type TranslationValues = Record<string, string | number>;
export type Translations = { language: SupportedLanguage; t: (key: TranslationKey, values?: TranslationValues) => string };

function interpolate(message: string, values?: TranslationValues) {
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) => values[key] === undefined ? match : String(values[key]));
}

export function getTranslations(language?: SupportedLanguage | string | null): Translations {
  const resolvedLanguage = resolveProductLanguage(language);
  const selected = bundles[resolvedLanguage] as Partial<Record<TranslationKey, string>>;
  return {
    language: resolvedLanguage,
    t(key, values) {
      const message = selected[key] ?? nlMessages[key];
      if (!selected[key] && resolvedLanguage !== defaultLanguage && process.env.NODE_ENV !== "production") {
        console.warn(`Missing translation key for ${resolvedLanguage}: ${key}`);
      }
      return interpolate(message ?? key, values);
    },
  };
}
