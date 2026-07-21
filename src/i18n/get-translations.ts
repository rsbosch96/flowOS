import messages from "./messages/nl.json" with { type: "json" };
import { defaultLanguage, resolveProductLanguage, type SupportedLanguage } from "./config.ts";

export type TranslationKey = keyof typeof messages;
export type Translations = { language: typeof defaultLanguage; t: (key: TranslationKey) => string };

export function getTranslations(language?: SupportedLanguage): Translations {
  const resolvedLanguage = resolveProductLanguage(language);
  return {
    language: resolvedLanguage,
    t(key) {
      const message = messages[key];
      if (!message && process.env.NODE_ENV !== "production") console.warn(`Missing translation key: ${key}`);
      return message ?? key;
    },
  };
}
