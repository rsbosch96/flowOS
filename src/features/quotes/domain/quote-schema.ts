import { z } from "zod";

export const quoteDraftSchema = z.object({
  title: z.string().min(3).max(160),
  scope: z.string().min(10).max(4000),
  assumptions: z.array(z.string().min(2).max(500)).max(12),
  items: z.array(z.object({ description: z.string().min(2).max(500), quantity: z.number().positive().max(100000), unit: z.string().min(1).max(30), unitPriceCents: z.number().int().nonnegative(), vatRate: z.number().min(0).max(100) })).min(1).max(100),
});

export type QuoteDraft = z.infer<typeof quoteDraftSchema>;
