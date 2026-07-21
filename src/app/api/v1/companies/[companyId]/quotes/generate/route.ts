import { NextResponse } from "next/server";
import { z } from "zod";
import { runAi } from "@/ai/gateway";
import { AiRateLimitError, AiStorageError, AiTimeoutError, AiValidationError } from "@/ai/errors";
import { generateQuoteSchema, quoteSystemPrompt } from "@/ai/prompts/generate-quote";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  requestText: z.string().trim().min(20).max(30000),
});

const normalizeCatalogName = (value: string) => value.trim().toLocaleLowerCase("nl-NL");

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Vul klant en aanvraag volledig in." } }, { status: 400 });

  const { companyId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Log opnieuw in." } }, { status: 401 });

  const { data: membership } = await supabase
    .from("company_memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || membership.role === "technician") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot deze organisatie." } }, { status: 403 });
  }

  const { data: catalog } = await supabase
    .from("product_catalog_items")
    .select("id,name,sku,unit")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(100);
  const activeCatalog = catalog ?? [];
  const catalogByName = new Map(activeCatalog.map((item) => [normalizeCatalogName(item.name), item]));
  const catalogText = activeCatalog
    .map((item) => `${item.name}${item.sku ? ` (${item.sku})` : ""}: ${item.unit}`)
    .join("\n");

  try {
    const result = await runAi({
      companyId,
      userId: user.id,
      feature: "quote_generation",
      systemPrompt: quoteSystemPrompt,
      userPrompt: `Aanvraag:\n${input.data.requestText}\n\nBeschikbare catalogusproducten (zonder prijzen):\n${catalogText || "Geen catalogusproducten beschikbaar."}`,
      schema: generateQuoteSchema,
      metadata: { catalogItemCount: activeCatalog.length, requestLength: input.data.requestText.length },
      preferredModel: process.env.AI_MODEL_QUOTE,
    }, async ({ data }) => {
      const notes = `${data.summary}\n\nAannames:\n${data.assumptions.map((item) => `- ${item}`).join("\n")}\n\nKlantvragen:\n${data.customerQuestions.map((item) => `- ${item}`).join("\n")}`;
      const draftItems = data.items.map((item) => {
        const matchedCatalogItem = catalogByName.get(normalizeCatalogName(item.catalogItemName ?? item.description));
        return {
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          catalogItemId: matchedCatalogItem?.id ?? null,
        };
      });
      const { data: quoteId, error } = await supabase.rpc("create_ai_quote_draft", {
        target_company_id: companyId,
        customer_name: input.data.customerName,
        customer_email: input.data.customerEmail || null,
        draft_title: data.title,
        draft_notes: notes,
        draft_items: draftItems,
      });
      if (error || !quoteId) throw new AiStorageError("Offerteconcept kon niet atomair worden opgeslagen.");
      return { quoteId: quoteId as string };
    });

    return NextResponse.json({ quoteId: result.quoteId, aiRunId: result.runId }, { status: 201 });
  } catch (error) {
    const status = error instanceof AiRateLimitError ? 429
      : error instanceof AiTimeoutError ? 504
        : error instanceof AiValidationError ? 422
          : error instanceof AiStorageError ? 500
            : 502;
    return NextResponse.json({
      error: {
        code: "AI_GENERATION_FAILED",
        message: "Het offerteconcept kon niet worden gemaakt. Controleer de aanvraag en probeer opnieuw.",
      },
    }, { status });
  }
}
