import { NextResponse } from "next/server";
import { z } from "zod";
import { runAi } from "@/ai/gateway";
import { AiConfigurationError, AiProviderError, AiRateLimitError, AiRunError, AiSpikeLimitError, AiStorageError, AiTimeoutError, AiValidationError } from "@/ai/errors";
import { createQuoteSystemPrompt, generateQuoteSchema } from "@/ai/prompts/generate-quote";
import { getOrganizationContext } from "@/i18n/organization-context";
import { logServerEvent, withApiRequest } from "@/lib/observability/server";
import { enforceRateLimit } from "@/lib/rate-limit/server";
import { createClient } from "@/lib/supabase/server";

const freeInputSchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  requestText: z.string().trim().min(20).max(30000),
});

const conversationInputSchema = z.object({ conversationId: z.string().uuid() });

type GenerationSource = {
  customerName: string;
  customerEmail: string | null;
  requestText: string;
  customerId?: string;
};

const normalizeCatalogName = (value: string, locale: Intl.LocalesArgument) => value.trim().toLocaleLowerCase(locale);

function quoteGenerationFailure(error: unknown) {
  if (error instanceof AiConfigurationError) return { status: 503, code: "AI_CONFIGURATION_REQUIRED", message: "De AI-offerteassistent is nog niet volledig geconfigureerd." };
  if (error instanceof AiSpikeLimitError) return { status: 429, code: "AI_SPIKE_LIMIT_REACHED", message: "De begrensde AI-testlimiet is bereikt. Probeer het niet opnieuw." };
  if (error instanceof AiRateLimitError) return { status: 429, code: "AI_RATE_LIMIT", message: "De AI-limiet is bereikt. Probeer het later opnieuw." };
  if (error instanceof AiTimeoutError) return { status: 504, code: "AI_TIMEOUT", message: "De AI-opdracht duurde te lang. Probeer het opnieuw." };
  if (error instanceof AiValidationError) return { status: 422, code: "AI_VALIDATION_FAILED", message: "De AI-uitvoer kon niet veilig als offerteconcept worden verwerkt." };
  if (error instanceof AiStorageError) return { status: 500, code: "QUOTE_STORAGE_FAILED", message: "Het offerteconcept kon niet worden opgeslagen." };
  if (error instanceof AiRunError) return { status: 503, code: "AI_RUN_UNAVAILABLE", message: "De AI-opdracht kan momenteel niet worden gestart." };
  if (error instanceof AiProviderError) return { status: 502, code: "AI_PROVIDER_UNAVAILABLE", message: "De AI-provider is tijdelijk niet bereikbaar." };
  return { status: 502, code: "AI_GENERATION_FAILED", message: "Het offerteconcept kon niet worden gemaakt. Probeer het opnieuw." };
}

function buildConversationRequestText(subject: string | null, messages: Array<{ direction: string; body: string | null }>) {
  const relevantMessages = messages
    .map((message) => ({
      label: message.direction === "inbound" ? "Klant" : "Bedrijf",
      body: message.body?.trim() ?? "",
    }))
    .filter((message) => message.body.length > 0);

  if (relevantMessages.length === 0) return null;

  return [
    `Onderwerp: ${(subject?.trim() || "Zonder onderwerp").slice(0, 500)}`,
    "",
    "Gespreksberichten:",
    ...relevantMessages.map((message) => `${message.label}: ${message.body}`),
  ].join("\n").slice(0, 30000);
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  return withApiRequest(request, { route: "/api/v1/companies/:companyId/quotes/generate" }, async (requestId) => {
    let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Vul klant en aanvraag volledig in." } }, { status: 400 });
  }

  const isConversationMode = typeof body === "object" && body !== null && "conversationId" in body;
  const conversationInput = isConversationMode ? conversationInputSchema.safeParse(body) : null;
  const freeInput = isConversationMode ? null : freeInputSchema.safeParse(body);
  if ((conversationInput && !conversationInput.success) || (freeInput && !freeInput.success)) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Vul klant en aanvraag volledig in." } }, { status: 400 });
  }

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
  const rateLimitError = await enforceRateLimit({ policy: "ai_quote_generate", subjectParts: [user.id, companyId], requestId, route: "/api/v1/companies/:companyId/quotes/generate", companyId, actorId: user.id });
  if (rateLimitError) return rateLimitError;

  let source: GenerationSource;
  if (conversationInput?.success) {
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id,company_id,customer_id,subject")
      .eq("id", conversationInput.data.conversationId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (conversationError) {
      return NextResponse.json({ error: { code: "CONVERSATION_LOOKUP_FAILED", message: "Aanvraag kon niet worden opgehaald." } }, { status: 500 });
    }
    if (!conversation) {
      return NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 });
    }
    if (!conversation.customer_id) {
      return NextResponse.json({ error: { code: "CONVERSATION_CUSTOMER_REQUIRED", message: "Deze aanvraag heeft geen geldige klant." } }, { status: 422 });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id,name,email,company_id")
      .eq("id", conversation.customer_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (customerError) {
      return NextResponse.json({ error: { code: "CONVERSATION_LOOKUP_FAILED", message: "Aanvraag kon niet worden opgehaald." } }, { status: 500 });
    }
    if (!customer) {
      return NextResponse.json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Aanvraag niet gevonden." } }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("conversation_messages")
      .select("direction,body,created_at")
      .eq("conversation_id", conversation.id)
      .eq("company_id", conversation.company_id)
      .in("direction", ["inbound", "outbound"])
      .order("created_at", { ascending: true })
      .limit(50);
    if (messagesError) {
      return NextResponse.json({ error: { code: "CONVERSATION_LOOKUP_FAILED", message: "Aanvraag kon niet worden opgehaald." } }, { status: 500 });
    }

    const requestText = buildConversationRequestText(conversation.subject, messages ?? []);
    if (!requestText || requestText.length < 20) {
      return NextResponse.json({ error: { code: "CONVERSATION_REQUEST_REQUIRED", message: "Deze aanvraag bevat onvoldoende informatie voor een offerteconcept." } }, { status: 422 });
    }

    source = {
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      requestText,
    };
  } else if (freeInput?.success) {
    source = {
      customerName: freeInput.data.customerName,
      customerEmail: freeInput.data.customerEmail || null,
      requestText: freeInput.data.requestText,
    };
  } else {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Vul klant en aanvraag volledig in." } }, { status: 400 });
  }

  const { data: catalog, error: catalogError } = await supabase
    .from("product_catalog_items")
    .select("id,name,sku,unit")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(100);
  if (catalogError) {
    return NextResponse.json({ error: { code: "CATALOG_LOOKUP_FAILED", message: "De productcatalogus kon niet worden opgehaald." } }, { status: 500 });
  }

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
      userPrompt: `Aanvraag:\n${source.requestText}\n\nBeschikbare catalogusproducten (zonder prijzen):\n${catalogText || "Geen catalogusproducten beschikbaar."}`,
      schema: generateQuoteSchema,
      metadata: { catalogItemCount: activeCatalog.length, requestLength: source.requestText.length, source: source.customerId ? "conversation" : "free_input" },
      preferredModel: process.env.AI_MODEL_QUOTE,
    }, async ({ data }) => {
      const draftItems = data.items.flatMap((item) => {
        const matchedCatalogItem = catalogByName.get(normalizeCatalogName(item.catalogItemName ?? item.description, organization.locale));
        if (!matchedCatalogItem) return [];
        return [{ description: matchedCatalogItem.name, quantity: item.quantity, catalogItemId: matchedCatalogItem.id }];
      });
      const unmatchedItems = data.items
        .filter((item) => !catalogByName.has(normalizeCatalogName(item.catalogItemName ?? item.description, organization.locale)))
        .map((item) => item.description);
      if (draftItems.length === 0) throw new AiValidationError("Geen AI-regel kon exact aan een actief catalogusproduct worden gekoppeld.");

      const notes = [
        data.summary,
        `Aannames:\n${data.assumptions.map((item) => `- ${item}`).join("\n") || "- Geen"}`,
        `Klantvragen:\n${data.customerQuestions.map((item) => `- ${item}`).join("\n") || "- Geen"}`,
        ...(unmatchedItems.length > 0 ? [`Niet opgenomen (geen exact actief catalogusproduct):\n${unmatchedItems.map((item) => `- ${item}`).join("\n")}`] : []),
      ].join("\n\n");

      const quoteDraft = source.customerId
        ? await supabase.rpc("create_ai_quote_draft", {
          target_company_id: companyId,
          target_customer_id: source.customerId,
          draft_title: data.title,
          draft_notes: notes,
          draft_items: draftItems,
        })
        : await supabase.rpc("create_ai_quote_draft", {
          target_company_id: companyId,
          customer_name: source.customerName,
          customer_email: source.customerEmail,
          draft_title: data.title,
          draft_notes: notes,
          draft_items: draftItems,
        });
      if (quoteDraft.error || !quoteDraft.data) throw new AiStorageError("Offerteconcept kon niet atomair worden opgeslagen.");
      return { quoteId: quoteDraft.data as string };
    });

    return NextResponse.json({ quoteId: result.quoteId, aiRunId: result.runId }, { status: 201 });
  } catch (error) {
    const failure = quoteGenerationFailure(error);
    logServerEvent({ level: "error", event: "quote.generation_failed", requestId, route: "/api/v1/companies/:companyId/quotes/generate", companyId, actorId: user.id, errorCode: failure.code });
    return NextResponse.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status });
  }
  });
}
