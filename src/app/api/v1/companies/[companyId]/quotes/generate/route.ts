import { NextResponse } from "next/server";
import { z } from "zod";
import { runAi } from "@/ai/gateway";
import { AiConfigurationError, AiProviderError, AiRateLimitError, AiRunError, AiStorageError, AiTimeoutError, AiValidationError } from "@/ai/errors";
import { createQuoteSystemPrompt, generateQuoteSchema } from "@/ai/prompts/generate-quote";
import { getOrganizationContext } from "@/i18n/organization-context";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  requestText: z.string().trim().min(20).max(30000),
});

const normalizeCatalogName = (value: string, locale: Intl.LocalesArgument) => value.trim().toLocaleLowerCase(locale);

function quoteGenerationFailure(error: unknown) {
  if (error instanceof AiConfigurationError) return { status: 503, code: "AI_CONFIGURATION_REQUIRED", message: "De AI-offerteassistent is nog niet volledig geconfigureerd." };
  if (error instanceof AiRateLimitError) return { status: 429, code: "AI_RATE_LIMIT", message: "De AI-limiet is bereikt. Probeer het later opnieuw." };
  if (error instanceof AiTimeoutError) return { status: 504, code: "AI_TIMEOUT", message: "De AI-opdracht duurde te lang. Probeer het opnieuw." };
  if (error instanceof AiValidationError) return { status: 422, code: "AI_VALIDATION_FAILED", message: "De AI-uitvoer kon niet veilig als offerteconcept worden verwerkt." };
  if (error instanceof AiStorageError) return { status: 500, code: "QUOTE_STORAGE_FAILED", message: "Het offerteconcept kon niet worden opgeslagen." };
  if (error instanceof AiRunError) return { status: 503, code: "AI_RUN_UNAVAILABLE", message: "De AI-opdracht kan momenteel niet worden gestart." };
  if (error instanceof AiProviderError) return { status: 502, code: "AI_PROVIDER_UNAVAILABLE", message: "De AI-provider is tijdelijk niet bereikbaar." };
  return { status: 502, code: "AI_GENERATION_FAILED", message: "Het offerteconcept kon niet worden gemaakt. Probeer het opnieuw." };
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const input = inputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Vul klant en aanvraag volledig in." } }, { status: 400 });

  const { companyId } = await params;
  const organization = getOrganizationContext(companyId);
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
  const catalogByName = new Map(activeCatalog.map((item) => [normalizeCatalogName(item.name, organization.locale), item]));
  const catalogText = activeCatalog
    .map((item) => `${item.name}${item.sku ? ` (${item.sku})` : ""}: ${item.unit}`)
    .join("\n");

  try {
    const result = await runAi({
      companyId,
      userId: user.id,
      feature: "quote_generation",
      language: organization.language,
      locale: organization.locale,
      systemPrompt: createQuoteSystemPrompt(organization.language, organization.locale),
      userPrompt: `Aanvraag:\n${input.data.requestText}\n\nBeschikbare catalogusproducten (zonder prijzen):\n${catalogText || "Geen catalogusproducten beschikbaar."}`,
      schema: generateQuoteSchema,
      metadata: { catalogItemCount: activeCatalog.length, requestLength: input.data.requestText.length },
      preferredModel: process.env.AI_MODEL_QUOTE,
    }, async ({ data }) => {
      const notes = `${data.summary}\n\nAannames:\n${data.assumptions.map((item) => `- ${item}`).join("\n")}\n\nKlantvragen:\n${data.customerQuestions.map((item) => `- ${item}`).join("\n")}`;
      const draftItems = data.items.map((item) => {
        const matchedCatalogItem = catalogByName.get(normalizeCatalogName(item.catalogItemName ?? item.description, organization.locale));
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
    const failure = quoteGenerationFailure(error);
    return NextResponse.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
  }
}
