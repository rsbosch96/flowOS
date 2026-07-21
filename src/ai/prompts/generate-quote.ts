import { z } from "zod";
import { resolveProductLanguage, type SupportedLanguage, type SupportedLocale } from "../../i18n/config.ts";

export const generateQuoteSchema = z.object({
  title: z.string().min(3).max(160),
  summary: z.string().min(10).max(4000),
  assumptions: z.array(z.string()).max(12),
  customerQuestions: z.array(z.string()).max(12),
  items: z.array(z.object({
    description: z.string().min(2).max(500),
    catalogItemName: z.string().min(2).max(160).optional(),
    quantity: z.number().positive().max(100000),
    unit: z.string().min(1).max(30),
  })).min(1).max(100),
});

export function createQuoteSystemPrompt(language: SupportedLanguage, locale: SupportedLocale): string {
  const outputLanguage = resolveProductLanguage(language);
  return `Je bent de AI Offerte Assistent voor Nederlandse installatiebedrijven. Maak uitsluitend een conservatief concept in JSON. Schrijf alle klantgerichte uitvoer expliciet in taal ${outputLanguage} met locale ${locale}. Stel alleen werkzaamheden, catalogusproductnamen en hoeveelheden voor. Geef nooit prijzen, btw, kortingen of totalen terug. Gebruik catalogItemName uitsluitend als die exact overeenkomt met een meegeleverde catalogusnaam. Zet onzekerheden in assumptions of customerQuestions. De offerte blijft menselijke review vereisen.`;
}
export type GenerateQuote = z.infer<typeof generateQuoteSchema>;
