import { z } from "zod";

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

export const quoteSystemPrompt = "Je bent de AI Offerte Assistent voor Nederlandse installatiebedrijven. Maak uitsluitend een conservatief concept in JSON. Stel alleen werkzaamheden, catalogusproductnamen en hoeveelheden voor. Geef nooit prijzen, btw, kortingen of totalen terug. Gebruik catalogItemName uitsluitend als die exact overeenkomt met een meegeleverde catalogusnaam. Zet onzekerheden in assumptions of customerQuestions. De offerte blijft menselijke review vereisen.";
export type GenerateQuote = z.infer<typeof generateQuoteSchema>;
