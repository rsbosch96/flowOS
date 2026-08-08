import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { calculateAiCost, calculateAiCostDetails } from "../src/ai/costs.ts";
import { AiBudgetStatus, type AiBudgetCostSnapshot } from "../src/ai/types.ts";
import { AiBudgetStatusUnknownError, AiErrorCode, AiRateLimitError, AiTimeoutError, getAiErrorCode } from "../src/ai/errors.ts";
import { executeAiRun } from "../src/ai/gateway-core.ts";
import { createQuoteSystemPrompt } from "../src/ai/prompts/generate-quote.ts";
import { defaultCurrency, defaultLanguage, defaultLocale, supportedLanguages, supportedLocales } from "../src/i18n/config.ts";
import { formatDate, formatMoney } from "../src/i18n/formatters.ts";
import { getTranslations } from "../src/i18n/get-translations.ts";
import { getOrganizationContext } from "../src/i18n/organization-context.ts";
import { createQuoteEmail } from "../src/features/quotes/infrastructure/quote-email-template.ts";
import { calculateVatSpecification } from "../src/features/invoices/infrastructure/vat-specification.ts";
import { readRuntimeConfig, RuntimeConfigError } from "../src/lib/config/runtime.ts";
import { sanitizeLogContext } from "../src/lib/observability/sanitize.ts";

const file = (path: string) => readFile(resolve(process.cwd(), path), "utf8");
const defaultRequest = {
  companyId: "company",
  userId: "user",
  feature: "quote_generation" as const,
  language: "nl" as const,
  locale: "nl-NL" as const,
  systemPrompt: "system",
  userPrompt: "input",
  schema: { safeParse: () => ({ success: true, data: {} }) } as never,
};

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(resolve(process.cwd(), directory), { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? sourceFiles(join(directory, entry.name))
    : [join(directory, entry.name)]));
  return paths.flat().filter((path) => /\.(ts|tsx)$/.test(path));
}

test("quote generation route delegates AI lifecycle to the gateway", async () => {
  const route = await file("src/app/api/v1/companies/[companyId]/quotes/generate/route.ts");
  assert.match(route, /import\s+\{\s*runAi\s*\}\s+from\s+"@\/ai\/gateway"/);
  assert.match(route, /await runAi\(/);
  assert.doesNotMatch(route, /start_ai_run|finish_ai_run|openai-provider|OpenAiProvider/);
});

test("quote generation exposes typed, safe AI failures to the user interface", async () => {
  const route = await file("src/app/api/v1/companies/[companyId]/quotes/generate/route.ts");
  const assistant = await file("src/features/quotes/components/quote-assistant.tsx");
  const admin = await file("src/lib/supabase/admin.ts");
  assert.match(admin, /throw new AiConfigurationError/);
  assert.match(route, /AI_CONFIGURATION_REQUIRED/);
  assert.match(route, /AI_RATE_LIMIT/);
  assert.match(route, /AI_TIMEOUT/);
  assert.match(route, /AI_VALIDATION_FAILED/);
  assert.match(route, /AI_PROVIDER_UNAVAILABLE/);
  assert.match(assistant, /errorMessage\(payload\.error\?\.code\)/);
  assert.match(assistant, /aiQuote\.configurationRequired/);
  assert.doesNotMatch(assistant, /payload\.error\?\.message/);
});

test("a provider failure creates one failed AI run", async () => {
  const finished: Array<{ runId: string; status: string; durationMs: number; currency: "EUR"; errorCode?: string }> = [];
  await assert.rejects(
    executeAiRun(
      defaultRequest,
      {
        provider: { name: "openai", generate: async () => { throw new AiRateLimitError("rate limited"); } },
        runs: { start: async () => "run-1", finish: async (entry) => { finished.push(entry); } },
      },
    ),
    AiRateLimitError,
  );
  assert.equal(finished.length, 1);
  assert.equal(finished[0]?.runId, "run-1");
  assert.equal(finished[0]?.status, "failed");
  assert.equal(finished[0]?.errorCode, AiErrorCode.RateLimit);
  assert.ok((finished[0]?.durationMs ?? -1) >= 0);
});

test("AI error classes use only central governance error codes", () => {
  assert.equal(getAiErrorCode(new AiRateLimitError("rate limited")), AiErrorCode.RateLimit);
  assert.equal(getAiErrorCode(new AiTimeoutError("timeout")), AiErrorCode.Timeout);
  assert.equal(getAiErrorCode(new AiBudgetStatusUnknownError("unknown cost")), AiErrorCode.BudgetStatusUnknown);
  assert.equal(getAiErrorCode(new Error("unknown")), AiErrorCode.Unknown);
});

test("cost calculation converts a known USD model price to EUR cents", () => {
  const cost = calculateAiCost({
    model: "known-model",
    usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    pricing: { "known-model": { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 4 } },
    usdEurRate: 0.9,
  });
  assert.deepEqual(cost, { estimatedCostCents: 360, currency: "EUR" });
});

test("cost calculation leaves the amount null when a verified model tariff is unavailable", () => {
  const cost = calculateAiCost({ model: "unknown-model", usage: { inputTokens: 100, outputTokens: 100 }, pricing: {}, usdEurRate: 0.9 });
  assert.deepEqual(cost, { estimatedCostCents: null, currency: "EUR" });
});

test("gateway records EUR-normalized cost metadata for every completed run", async () => {
  const previousPricing = process.env.AI_MODEL_PRICING_JSON;
  const previousRate = process.env.AI_USD_EUR_RATE;
  process.env.AI_MODEL_PRICING_JSON = JSON.stringify({ "known-model": { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 } });
  process.env.AI_USD_EUR_RATE = "1";
  const finished: Array<{ estimatedCostCents?: number | null; currency: "EUR"; provider?: string; status: string }> = [];
  try {
    await executeAiRun(defaultRequest, {
      provider: { name: "openai", generate: async () => ({ data: {}, provider: "openai" as const, model: "known-model", usage: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 } }) } as never,
      runs: { start: async () => "run-2", finish: async (entry) => { finished.push(entry); } },
    });
  } finally {
    if (previousPricing === undefined) delete process.env.AI_MODEL_PRICING_JSON; else process.env.AI_MODEL_PRICING_JSON = previousPricing;
    if (previousRate === undefined) delete process.env.AI_USD_EUR_RATE; else process.env.AI_USD_EUR_RATE = previousRate;
  }
  assert.equal(finished.length, 1);
  assert.equal(finished[0]?.status, "succeeded");
  assert.equal(finished[0]?.provider, "openai");
  assert.equal(finished[0]?.estimatedCostCents, 100);
  assert.equal(finished[0]?.currency, "EUR");
});

test("RC1 cost details retain both USD and EUR values without inventing a tariff", () => {
  const cost = calculateAiCostDetails({
    model: "gpt-5.6-luna",
    usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
    pricing: { "gpt-5.6-luna": { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 6 } },
    usdEurRate: 0.9,
  });
  assert.deepEqual(cost, { estimatedCostCents: 360, estimatedCostUsdMicros: 4_000_000, currency: "EUR" });
});

test("a provider failure cannot persist a half quote draft", async () => {
  let persisted = false;
  await assert.rejects(
    executeAiRun(
      defaultRequest,
      {
        provider: { name: "openai", generate: async () => { throw new AiRateLimitError("rate limited"); } },
        runs: { start: async () => "run-no-draft", finish: async () => undefined },
      },
      async () => {
        persisted = true;
        return { quoteId: "must-not-exist" };
      },
    ),
    AiRateLimitError,
  );
  assert.equal(persisted, false);
});

test("F1B keeps RC1 live safeguards server-side and leaves mock mode unrestricted", async () => {
  const spike = await file("src/ai/rc1-spike.ts");
  const provider = await file("src/ai/providers/openai-provider.ts");
  const gateway = await file("src/ai/gateway.ts");
  const env = await file(".env.example");

  assert.match(provider, /if \(process\.env\.AI_MODE === "mock"\)[\s\S]*?return \{ data:/);
  assert.match(provider, /const rc1Config = getRc1SpikeConfig\(model\);[\s\S]*?fetch\("https:\/\/api\.openai\.com\/v1\/responses"/);
  assert.match(spike, /if \(maxCost\.estimatedCostCents === null \|\| maxCost\.estimatedCostUsdMicros === null\)[\s\S]*?AiConfigurationError/);

  assert.match(spike, /const MAX_RC1_OUTPUT_TOKENS = 800/);
  assert.match(spike, /boundedInteger\("AI_RC1_MAX_OUTPUT_TOKENS", MAX_RC1_OUTPUT_TOKENS, MAX_RC1_OUTPUT_TOKENS\)/);
  assert.match(provider, /max_output_tokens: rc1Config\.maxOutputTokens/);
  assert.match(spike, /const MAX_RC1_INPUT_TOKENS = 4_000/);
  assert.match(spike, /const MAX_RC1_INPUT_BYTES = 3_600/);
  assert.match(spike, /TextEncoder\(\)\.encode/);
  assert.doesNotMatch(provider, /retry|for \(|while \(/i);

  assert.match(spike, /const MAX_RC1_CALLS = 5/);
  assert.match(spike, /attempts\.length >= config\.maxCalls/);
  assert.match(spike, /knownSpentCents \+ maximumRemainingCents > config\.budgetCents/);
  assert.match(gateway, /contains\("metadata", marker\)/);
  assert.match(gateway, /rc1ProviderCallAttempted: true/);
  assert.match(gateway, /reserveRc1ProviderCall[\s\S]*?beforeProvider/);

  assert.match(env, /OPENAI_QUOTE_MODEL=gpt-5\.6-luna/);
  assert.match(env, /"gpt-5\.6-luna":\{"inputUsdPerMillionTokens":1,"outputUsdPerMillionTokens":6\}/);
  assert.match(env, /AI_RC1_MAX_OUTPUT_TOKENS=800/);
  assert.match(env, /AI_RC1_MAX_CALLS=5/);
  assert.match(env, /AI_RC1_SPIKE_BUDGET_CENTS=25/);
});

test("migration keeps quote storage atomic and catalog prices authoritative", async () => {
  const migration = await file("supabase/migrations/014_sprint_1_25_architecture_hardening.sql");
  assert.match(migration, /drop function if exists public\.finish_ai_run\(uuid, public\.ai_run_status, uuid, text, integer, integer, text\)/);
  assert.match(migration, /create function public\.create_ai_quote_draft/);
  assert.match(migration, /item_price_cents := catalog_item\.default_unit_price_cents/);
  assert.match(migration, /item_price_cents := 0/);
  assert.match(migration, /insert into public\.customers[\s\S]*insert into public\.quotes[\s\S]*insert into public\.quote_items/);
});

test("repair migration restores the authenticated atomic quote-draft RPC", async () => {
  const migration = await file("supabase/migrations/018_restore_create_ai_quote_draft.sql");
  assert.match(migration, /create or replace function public\.create_ai_quote_draft/);
  assert.match(migration, /security definer/);
  assert.match(migration, /insert into public\.customers[\s\S]*insert into public\.quotes[\s\S]*insert into public\.quote_items/);
  assert.doesNotMatch(migration, /exception\s+when/i);
  assert.match(migration, /item_price_cents := catalog_item\.default_unit_price_cents/);
  assert.match(migration, /item_price_cents := 0/);
  assert.match(migration, /grant execute on function public\.create_ai_quote_draft[\s\S]* to authenticated/);
});

test("quote and invoice line items preserve price and description snapshots", async () => {
  const schema = await file("outputs/database-schema.sql");
  const invoices = await file("supabase/migrations/010_invoices.sql");
  const quoteItemDefinition = schema.match(/create table public\.quote_items \(([\s\S]*?)\n\);/)?.[1] ?? "";
  const invoiceItemDefinition = invoices.match(/create table public\.invoice_items \(([\s\S]*?)\n\);/)?.[1] ?? "";

  for (const itemDefinition of [quoteItemDefinition, invoiceItemDefinition]) {
    assert.match(itemDefinition, /description text not null/);
    assert.match(itemDefinition, /quantity numeric/);
    assert.match(itemDefinition, /unit_price_cents bigint not null/);
    assert.match(itemDefinition, /vat_rate numeric/);
    assert.match(itemDefinition, /line_total_cents bigint not null/);
    assert.doesNotMatch(itemDefinition, /catalog_item_id|product_catalog_items/);
  }

  assert.match(invoices, /select new_invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents from public\.quote_items/);
});

test("WP7.2A locks invoices behind tenant-scoped RPCs, atomic numbering and immutable snapshots", async () => {
  const migration = await file("supabase/migrations/024_invoice_integrity_and_numbering.sql");
  const invoiceRoute = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/invoice/route.ts");
  const statusRoute = await file("src/app/api/v1/companies/[companyId]/invoices/[invoiceId]/status/route.ts");
  const pdfRoute = await file("src/app/api/v1/companies/[companyId]/invoices/[invoiceId]/pdf/route.ts");
  const source = await Promise.all((await sourceFiles("src")).map(async (path) => ({ path, content: await file(path) })));

  assert.match(migration, /create table if not exists public\.invoice_number_counters/);
  assert.match(migration, /primary key \(company_id, fiscal_year\)/);
  assert.match(migration, /on conflict \(company_id, fiscal_year\) do update[\s\S]*next_number = public\.invoice_number_counters\.next_number \+ 1/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create function public.create_invoice_from_quote")), /count\(\*\)/);
  assert.match(migration, /where id = target_quote_id and company_id = target_company_id[\s\S]*for update/);
  assert.match(migration, /select id into new_invoice_id from public\.invoices where quote_id = quote_record\.id/);
  assert.match(migration, /drop policy if exists "tenant invoices"[\s\S]*for select to authenticated/);
  assert.doesNotMatch(migration, /for all to authenticated/i);
  assert.match(migration, /before delete on public\.invoices/);
  assert.match(migration, /before update or delete on public\.invoice_items/);
  assert.match(migration, /Invoice content is immutable/);
  assert.match(migration, /company_name text,[\s\S]*customer_email text/);
  assert.match(migration, /insert into public\.audit_logs[\s\S]*invoice\.created_from_quote/);
  assert.match(migration, /invoice\.sent/);
  assert.match(migration, /invoice\.paid/);
  assert.match(migration, /invoice\.voided/);
  assert.match(migration, /invoice_record\.status = 'draft' and target_status = 'sent'/);
  assert.match(migration, /invoice_record\.status in \('sent', 'overdue'\) and target_status = 'paid'/);
  assert.match(migration, /invoice_record\.status in \('draft', 'sent', 'overdue'\) and target_status = 'void'/);
  assert.match(invoiceRoute, /eq\("id", quoteId\)\.eq\("company_id", companyId\)/);
  assert.match(invoiceRoute, /target_company_id: quote\.company_id/);
  assert.doesNotMatch(invoiceRoute, /audit_logs/);
  assert.match(statusRoute, /z\.enum\(\["sent", "paid", "void"\]\)/);
  assert.match(statusRoute, /eq\("id", invoiceId\)\.eq\("company_id", companyId\)/);
  assert.match(pdfRoute, /company_name,company_address/);
  assert.doesNotMatch(pdfRoute, /from\("companies"\)|customers\(/);
  for (const entry of source.filter(({ path }) => path.replaceAll("\\", "/") !== "src/lib/audit/server.ts")) assert.doesNotMatch(entry.content, /from\("audit_logs"\)\.insert/, entry.path);
});

test("invoice number repair avoids ambiguous fiscal_year references", async () => {
  const migration = await file("supabase/migrations/20260805181835_027_fix_invoice_fiscal_year_ambiguity.sql");
  const functionBody = migration.slice(migration.indexOf("create or replace function public.create_invoice_from_quote"));
  const withoutRequiredInsertColumn = functionBody.replace("(company_id, fiscal_year, next_number)", "");

  assert.match(functionBody, /returns uuid[\s\S]*security definer[\s\S]*set search_path = public/);
  assert.match(functionBody, /target_fiscal_year integer := extract\(year from current_date\)::integer/);
  assert.match(functionBody, /insert into public\.invoice_number_counters as counters \(company_id, fiscal_year, next_number\)/);
  assert.match(functionBody, /values \(target_company_id, target_fiscal_year, 2\)[\s\S]*on conflict on constraint invoice_number_counters_pkey[\s\S]*counters\.next_number/);
  assert.match(functionBody, /'F-' \|\| target_fiscal_year::text/);
  assert.doesNotMatch(withoutRequiredInsertColumn, /(?<![._])\bfiscal_year\b/);
  assert.match(functionBody, /invoice\.created_from_quote/);
});

test("WP7.2B.1 blocks new invoices without mandatory company and customer details", async () => {
  const migration = await file("supabase/migrations/20260805181836_028_require_invoice_party_details.sql");
  const route = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/invoice/route.ts");
  const profileRoute = await file("src/app/api/v1/companies/[companyId]/profile/route.ts");
  const profilePage = await file("src/app/(app)/app/[companySlug]/settings/company-profile/page.tsx");
  const profileForm = await file("src/features/company-profile/components/company-profile-form.tsx");

  assert.match(migration, /security definer[\s\S]*set search_path = public/);
  assert.match(migration, /has_company_role\(target_company_id, array\['owner', 'employee'\]/);
  assert.match(migration, /where id = target_quote_id and company_id = target_company_id[\s\S]*for update/);
  assert.match(migration, /if found then return new_invoice_id; end if;[\s\S]*company_iban_value/);
  assert.match(migration, /'company_kvk'/);
  assert.match(migration, /'company_vat_number'/);
  assert.match(migration, /'company_iban'/);
  assert.match(migration, /'company_street'/);
  assert.match(migration, /'customer_name'/);
  assert.match(migration, /'customer_street'/);
  assert.match(migration, /message = 'INVOICE_PARTY_DETAILS_MISSING'/);
  assert.ok(migration.indexOf("message = 'INVOICE_PARTY_DETAILS_MISSING'") < migration.indexOf("insert into public.invoice_number_counters"));
  assert.match(route, /error\?\.code === "P0001" && error\.message === "INVOICE_PARTY_DETAILS_MISSING"/);
  assert.match(route, /status: 422/);
  assert.match(profileRoute, /iban: optionalText\(34\)/);
  assert.match(profileRoute, /iban: emptyToNull\(input\.data\.iban\)/);
  assert.match(profilePage, /kvk_number,vat_number,iban,address/);
  assert.match(profileForm, /companyProfile\.iban/);
});

test("draft quote updates use one tenant-scoped atomic RPC with server-side totals", async () => {
  const migration = await file("supabase/migrations/022_atomic_draft_quote_updates.sql");
  const route = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/route.ts");
  const editor = await file("src/features/quotes/components/quote-editor.tsx");

  assert.match(migration, /create or replace function public\.update_draft_quote/);
  assert.match(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /has_company_role\(target_company_id, array\['owner', 'employee'\]/);
  assert.match(migration, /id = target_quote_id[\s\S]*company_id = target_company_id[\s\S]*for update/);
  assert.match(migration, /quote_record\.status <> 'draft'/);
  assert.match(migration, /coalesce\(jsonb_typeof\(draft_items\), ''\) <> 'array'/);
  assert.match(migration, /item_quantity <= 0/);
  assert.match(migration, /item_price_cents < 0/);
  assert.match(migration, /vat_subtotals/);
  assert.match(migration, /delete from public\.quote_items[\s\S]*insert into public\.quote_items[\s\S]*update public\.quotes/);
  assert.doesNotMatch(migration, /exception\s+when/i);
  assert.match(migration, /grant execute on function public\.update_draft_quote[\s\S]* to authenticated/);
  assert.match(route, /rpc\("update_draft_quote"/);
  assert.doesNotMatch(route, /from\("quote_items"\)\.(delete|insert)/);
  assert.doesNotMatch(route, /from\("quotes"\)\.update/);
  assert.match(route, /draft_items: input\.data\.items/);
  const inputSchema = route.slice(route.indexOf("const inputSchema"), route.indexOf("export async"));
  assert.doesNotMatch(inputSchema, /subtotal|tax|total/i);
  assert.match(editor, /subtotalsByVatRate/);
});

test("only draft quotes render editing controls while immutable snapshots stay separate", async () => {
  const page = await file("src/app/(app)/app/[companySlug]/quotes/[quoteId]/page.tsx");
  const invoices = await file("supabase/migrations/010_invoices.sql");

  assert.match(page, /quote\.status === "draft" \? <div className="mt-4"><QuoteEditor/);
  assert.match(page, /quote\.status === "draft" \? "Offerte aanpassen" : "Regels"/);
  assert.match(invoices, /insert into public\.invoice_items[\s\S]*select new_invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents from public\.quote_items/);
});

test("catalog archiving preserves VAT snapshots and prevents future AI quote selection", async () => {
  const catalogRoute = await file("src/app/api/v1/companies/[companyId]/catalog/[productId]/route.ts");
  const imageMigration = await file("supabase/migrations/019_catalog_product_image_storage.sql");
  const quoteDraft = await file("supabase/migrations/018_restore_create_ai_quote_draft.sql");
  const invoices = await file("supabase/migrations/010_invoices.sql");

  assert.match(catalogRoute, /isActive: z\.boolean\(\)/);
  assert.match(catalogRoute, /update\(\{ is_active: active\.data\.isActive/);
  assert.doesNotMatch(catalogRoute, /\.delete\(\)/);
  assert.match(quoteDraft, /default_vat_rate/);
  assert.match(quoteDraft, /item_vat_rate := catalog_item\.default_vat_rate/);
  assert.match(quoteDraft, /line_total_cents/);
  assert.match(invoices, /unit_price_cents, vat_rate, line_total_cents from public\.quote_items/);
  assert.match(imageMigration, /add column if not exists image_storage_path text/);
});

test("pilot UX exposes a tenant-isolated company profile and an actionable empty catalog", async () => {
  const migration = await file("supabase/migrations/021_company_profile_contact_fields.sql");
  const profileRoute = await file("src/app/api/v1/companies/[companyId]/profile/route.ts");
  const settings = await file("src/app/(app)/app/[companySlug]/settings/page.tsx");
  const catalog = await file("src/features/catalog/components/catalog-manager.tsx");

  assert.match(migration, /add column if not exists phone text/);
  assert.match(migration, /add column if not exists email text/);
  assert.match(migration, /add column if not exists website text/);
  assert.match(profileRoute, /eq\("company_id", companyId\)\.eq\("user_id", user\.id\)/);
  assert.match(profileRoute, /membership\?\.role !== "owner"/);
  assert.match(profileRoute, /phone: emptyToNull/);
  assert.match(profileRoute, /logo_storage_path/);
  assert.match(settings, /settings\/company-profile/);
  assert.match(catalog, /id="catalog-add-form"/);
  assert.match(catalog, /href="#catalog-add-form"/);
});

test("catalog image upload validates content and keeps storage tenant-scoped", async () => {
  const upload = await file("src/app/api/v1/companies/[companyId]/catalog/[productId]/image/upload-url/route.ts");
  const confirm = await file("src/app/api/v1/companies/[companyId]/catalog/[productId]/image/confirm/route.ts");
  const catalogPage = await file("src/app/(app)/app/[companySlug]/catalog/page.tsx");
  const documentUpload = await file("src/app/api/v1/companies/[companyId]/documents/upload-url/route.ts");

  for (const productImageSource of [upload, confirm, catalogPage]) {
    assert.match(productImageSource, /company-images/);
    assert.doesNotMatch(productImageSource, /company-documents/);
  }
  assert.match(documentUpload, /storage\.from\("company-documents"\)/);
  assert.doesNotMatch(documentUpload, /company-images/);
  assert.match(upload, /\$\{companyId\}\/catalog\/\$\{productId\}/);
  assert.match(upload, /image\/(jpeg|png)/);
  assert.match(upload, /5 \* 1024 \* 1024/);
  assert.match(confirm, /detectedMimeType/);
  assert.match(confirm, /arrayBuffer\(\)/);
  assert.match(confirm, /blob\.size > maxBytes/);
  assert.match(confirm, /remove\(\[input\.data\.path\]\)/);
  assert.match(confirm, /startsWith\(expectedPrefix\)/);
  assert.match(confirm, /image_storage_path/);
});

test("catalog image confirmation rejects a storage path from another tenant before storage access", async () => {
  const confirm = await file("src/app/api/v1/companies/[companyId]/catalog/[productId]/image/confirm/route.ts");

  assert.match(confirm, /const expectedPrefix = `\$\{companyId\}\/catalog\/\$\{productId\}\//);
  assert.match(confirm, /if \(!input\.data\.path\.startsWith\(expectedPrefix\)\)/);
  assert.match(confirm, /Ongeldig afbeeldingspad/);
  assert.match(confirm, /status: 400/);
  assert.ok(confirm.indexOf("!input.data.path.startsWith(expectedPrefix)") < confirm.indexOf("storage.from(\"company-images\").download"));
});

test("storage provisioning concept keeps document and image bucket contracts separate", async () => {
  const migration = await file("supabase/migrations/020_provision_storage_buckets.sql");
  const documentUpload = await file("src/app/api/v1/companies/[companyId]/documents/upload-url/route.ts");
  const imageUpload = await file("src/app/api/v1/companies/[companyId]/catalog/[productId]/image/upload-url/route.ts");

  assert.match(migration, /'company-documents', 'company-documents', false, 26214400/);
  assert.match(migration, /array\['application\/pdf', 'image\/jpeg', 'image\/png', 'text\/plain'\]::text\[\]/);
  assert.match(migration, /'company-images', 'company-images', false, 5242880/);
  assert.match(migration, /array\['image\/jpeg', 'image\/png'\]::text\[\]/);
  assert.match(migration, /auth\.uid\(\) is not null/);
  assert.match(migration, /cm\.company_id = case/);
  assert.match(migration, /cm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /for insert[\s\S]*with check/);
  assert.doesNotMatch(migration, /for update/i);
  assert.match(documentUpload, /storage\.from\("company-documents"\)/);
  assert.match(imageUpload, /storage\.from\("company-images"\)/);
  assert.doesNotMatch(imageUpload, /storage\.from\("company-documents"\)/);
});

test("public quote routes reject malformed input without provider error details", async () => {
  const route = await file("src/app/api/public/quotes/[token]/route.ts");
  const page = await file("src/app/offerte/[token]/page.tsx");
  assert.match(route, /const tokenSchema = z\.string\(\)\.regex\(\/\^\[a-f0-9\]\{64\}\$\/i\)/);
  assert.match(route, /z\.literal\("question"\), comment: z\.string\(\)\.trim\(\)\.min\(2\)\.max\(2000\)/);
  assert.doesNotMatch(route, /error\?\.message/);
  assert.match(page, /z\.string\(\)\.regex\(\/\^\[a-f0-9\]\{64\}\$\/i\)\.safeParse\(token\)/);
});

test("WP6.1A resets raw customer links and uses only token hashes", async () => {
  const migration = await file("supabase/migrations/023_quote_delivery_and_hashed_public_tokens.sql");
  const route = await file("src/app/api/public/quotes/[token]/route.ts");
  const page = await file("src/app/offerte/[token]/page.tsx");

  assert.match(migration, /add column if not exists public_token_hash text unique/);
  assert.match(migration, /public_token = null,[\s\S]*public_token_hash = null,[\s\S]*public_token_expires_at = null,[\s\S]*public_token_revoked_at = now\(\)/);
  assert.match(migration, /encode\(gen_random_bytes\(32\), 'hex'\)/);
  assert.match(migration, /encode\(digest\(raw_token, 'sha256'\), 'hex'\)/);
  assert.match(migration, /public_token_hash = public\.hash_public_quote_token\(raw_token\)/);
  assert.match(migration, /public_token_revoked_at is null/);
  assert.match(migration, /revoke all on function public\.get_public_quote\(uuid\)/);
  assert.match(migration, /create or replace function public\.rotate_public_quote_token/);
  assert.match(migration, /create or replace function public\.revoke_public_quote_token/);
  assert.match(migration, /set public_token = null,[\s\S]*public_token_hash = null,[\s\S]*public_token_revoked_at = now\(\)/);
  assert.match(route, /raw_token: token/);
  assert.match(page, /raw_token: token/);
});

test("WP6.1A repair qualifies pgcrypto calls without changing token RPC contracts", async () => {
  const migration = await file("supabase/migrations/025_fix_pgcrypto_schema_qualification.sql");

  assert.match(migration, /create or replace function public\.hash_public_quote_token\(raw_token text\)[\s\S]*extensions\.digest\(raw_token::text, 'sha256'::text\)/);
  assert.match(migration, /create or replace function public\.publish_quote_for_customer\([\s\S]*target_quote_id uuid,[\s\S]*target_company_id uuid,[\s\S]*expiry_days integer default 30[\s\S]*security definer[\s\S]*set search_path = public[\s\S]*extensions\.gen_random_bytes\(32::integer\)/);
  assert.match(migration, /create or replace function public\.rotate_public_quote_token\([\s\S]*target_quote_id uuid,[\s\S]*target_company_id uuid,[\s\S]*expiry_days integer default 30[\s\S]*security definer[\s\S]*set search_path = public[\s\S]*extensions\.gen_random_bytes\(32::integer\)/);
  assert.doesNotMatch(migration, /create or replace function public\.(get_public_quote|customer_decide_quote|customer_question_quote|reserve_quote_email_delivery)/);
});

test("repair migration restores only missing quote-delivery schema objects without raw-token fallback", async () => {
  const migration = await file("supabase/migrations/026_repair_quote_delivery_schema_objects.sql");
  const pgcryptoRepair = await file("supabase/migrations/025_fix_pgcrypto_schema_qualification.sql");

  assert.match(migration, /add column if not exists public_token_hash text/);
  assert.match(migration, /add column if not exists public_token_revoked_at timestamptz/);
  assert.match(migration, /create table if not exists public\.quote_email_deliveries/);
  assert.match(migration, /unique \(quote_id, delivery_type, idempotency_key\)/);
  assert.match(migration, /on conflict \(quote_id, delivery_type, idempotency_key\) do nothing/);
  assert.match(migration, /public_token_hash = public\.hash_public_quote_token\(generated_token\)/);
  assert.match(migration, /public_token_hash = public\.hash_public_quote_token\(raw_token\)/);
  assert.match(migration, /to_regprocedure\('public\.rotate_public_quote_token\(uuid,uuid,integer\)'\) is null/);
  assert.match(migration, /grant execute on function public\.complete_quote_email_delivery\(uuid, uuid, text\) to service_role/);
  assert.match(pgcryptoRepair, /extensions\.digest\(raw_token::text, 'sha256'::text\)/);
  assert.match(pgcryptoRepair, /extensions\.gen_random_bytes\(32::integer\)/);
  assert.doesNotMatch(migration, /public_token\s*=\s*generated_token/);
  assert.doesNotMatch(migration, /where q\.public_token\s*=/);
});

test("WP6.1A validates quote company ownership before publishing and audits the validated tenant", async () => {
  const publish = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/publish/route.ts");
  const email = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/email/route.ts");
  const migration = await file("supabase/migrations/023_quote_delivery_and_hashed_public_tokens.sql");

  assert.match(publish, /eq\("id", quoteId\)\.eq\("company_id", companyId\)/);
  assert.match(publish, /target_company_id: quote\.company_id/);
  assert.match(publish, /company_id: quote\.company_id/);
  assert.match(email, /eq\("id", quoteId\)\.eq\("company_id", companyId\)/);
  assert.match(migration, /where id = target_quote_id and company_id = target_company_id/);
  assert.match(migration, /Quote not found for this company/);
});

test("WP6.1A records idempotent Resend deliveries without storing raw tokens", async () => {
  const migration = await file("supabase/migrations/023_quote_delivery_and_hashed_public_tokens.sql");
  const emailRoute = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/email/route.ts");
  const remindRoute = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/remind/route.ts");
  const sender = await file("src/features/quotes/infrastructure/send-quote-email.ts");

  assert.match(migration, /create table if not exists public\.quote_email_deliveries/);
  assert.match(migration, /unique \(quote_id, delivery_type, idempotency_key\)/);
  assert.match(migration, /status text not null check \(status in \('pending', 'sent', 'failed'\)\)/);
  assert.match(migration, /provider_message_id text/);
  assert.match(migration, /tenant quote email deliveries read/);
  assert.match(migration, /on conflict \(quote_id, delivery_type, idempotency_key\) do nothing/);
  assert.match(migration, /'shouldSend', false/);
  assert.match(migration, /set status = 'failed', error_code/);
  assert.match(migration, /set status = 'sent', provider_message_id/);
  assert.match(migration, /Only the mail service may complete a delivery/);
  assert.match(migration, /grant execute on function public\.complete_quote_email_delivery\(uuid, uuid, text\) to service_role/);
  assert.match(emailRoute, /Idempotency-Key/);
  assert.match(remindRoute, /Idempotency-Key/);
  assert.match(sender, /if \(!reserved\.shouldSend\) \{/);
  assert.match(sender, /provider_message: providerData\.id/);
  assert.match(sender, /admin = createAdminClient\(\)/);
  assert.doesNotMatch(sender, /metadata.*rawToken|rawToken.*metadata/s);
});

test("WP6.1A safely escapes HTML email and also renders plain text", () => {
  const email = createQuoteEmail({
    type: "initial",
    recipientName: "<script>alert(1)</script>",
    companyName: "A & B <bedrijf>",
    quoteNumber: "Q-1",
    quoteTitle: "<b>Werk</b>",
    publicUrl: "https://example.test/offerte/" + "a".repeat(64),
  });

  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(email.html, /A &amp; B &lt;bedrijf&gt;/);
  assert.doesNotMatch(email.text, /<script>|<b>|<bedrijf>/);
  assert.match(email.text, /Bekijk offerte: https:\/\/example\.test\/offerte\//);
});

test("WP6.1A logs one public decision and bounds public questions per hashed token", async () => {
  const migration = await file("supabase/migrations/023_quote_delivery_and_hashed_public_tokens.sql");
  const decisionFunction = migration.slice(migration.indexOf("create or replace function public.customer_decide_quote(\n  raw_token text"), migration.indexOf("create or replace function public.customer_question_quote"));
  const auditInsert = decisionFunction.slice(decisionFunction.indexOf("insert into public.audit_logs"));

  assert.match(decisionFunction, /status = 'sent'[\s\S]*returning id, company_id into decided_quote/);
  assert.match(decisionFunction, /'quote\.accepted'/);
  assert.match(decisionFunction, /'quote\.rejected'/);
  assert.match(decisionFunction, /jsonb_build_object\('source', 'public_quote'\)/);
  assert.doesNotMatch(auditInsert, /customer_comment|raw_token|comment/);
  assert.match(migration, /questions_last_hour >= 3 or questions_total >= 20/);
  assert.match(migration, /for update/);
  assert.match(migration, /public_token_hash = public\.hash_public_quote_token\(raw_token\)/);
});

test("a hashed public token selects exactly one unrevoked quote and exposes no internal quote id", async () => {
  const migration = await file("supabase/migrations/023_quote_delivery_and_hashed_public_tokens.sql");
  const publicPage = await file("src/app/offerte/[token]/page.tsx");
  const internalPage = await file("src/app/(app)/app/[companySlug]/quotes/[quoteId]/page.tsx");
  const editor = await file("src/features/quotes/components/quote-editor.tsx");
  assert.match(migration, /where q\.public_token_hash = public\.hash_public_quote_token\(raw_token\)[\s\S]*q\.public_token_expires_at > now\(\)/);
  assert.match(migration, /q\.public_token_revoked_at is null/);
  assert.match(migration, /where qi\.quote_id = q\.id/);
  assert.doesNotMatch(migration, /'id', q\.id/);
  assert.doesNotMatch(migration, /'notes', q\.notes/);
  assert.doesNotMatch(publicPage, /quote\.notes|notes: string \| null|>Toelichting</);
  assert.match(internalPage, /select\("id,quote_number,title,status,notes,/);
  assert.match(internalPage, /initialNotes=\{quote\.notes\}/);
  assert.match(editor, /body: JSON\.stringify\(\{ title, notes: notes \|\| null, items \}\)/);
  assert.doesNotMatch(migration, /customerComment/);
});

test("AI admin mutations require service role and the initiating tenant membership", async () => {
  const admin = await file("src/lib/supabase/admin.ts");
  const runtimeConfig = await file("src/lib/config/runtime.ts");
  const migration = await file("supabase/migrations/014_sprint_1_25_architecture_hardening.sql");
  assert.match(admin, /import "server-only"/);
  assert.match(admin, /getAdminSupabaseConfig/);
  assert.match(runtimeConfig, /environment\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_(SERVICE_ROLE|SECRET)_KEY/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /company_id = target_company_id and user_id = target_initiated_by/);
  assert.match(migration, /grant execute on function public\.start_ai_run[\s\S]* to service_role/);
});

test("WP13.2B hardens SECURITY DEFINER privileges without changing function bodies", async () => {
  const migration = await file("supabase/migrations/20260805181837_029_harden_security_definer_privileges.sql");
  const publicCapabilities = [
    "get_public_quote(text)",
    "customer_decide_quote(text, public.quote_status, text)",
    "customer_question_quote(text, text)",
  ];
  const authenticatedOnly = [
    "add_company_member_by_email(uuid, text, public.company_role)",
    "bootstrap_company(text, text)",
    "create_ai_quote_draft(uuid, text, text, text, text, jsonb)",
    "create_invoice_from_quote(uuid, uuid)",
    "publish_quote_for_customer(uuid, uuid, integer)",
    "reserve_quote_email_delivery(uuid, uuid, text, text, uuid)",
    "revoke_public_quote_token(uuid, uuid)",
    "rotate_public_quote_token(uuid, uuid, integer)",
    "transition_invoice_status(uuid, uuid, text, text)",
    "update_draft_quote(uuid, uuid, text, text, jsonb)",
    "has_company_role(uuid, public.company_role[])",
    "is_company_member(uuid)",
  ];
  const serviceOnly = [
    "complete_quote_email_delivery(uuid, uuid, text)",
    "fail_quote_email_delivery(uuid, uuid, text)",
    "finish_ai_run(uuid, public.ai_run_status, uuid, text, text, integer, integer, integer, integer, integer, character, text, text)",
    "start_ai_run(uuid, uuid, text, text, jsonb, text, text)",
  ];
  const droppedLegacy = [
    "customer_decide_quote(uuid, public.quote_status, text)",
    "customer_question_quote(uuid, text)",
    "finish_ai_run(uuid, public.ai_run_status, uuid, text, integer, integer, text)",
    "get_public_quote(uuid)",
    "publish_quote_for_customer(uuid, integer)",
    "start_ai_run(uuid, text, text)",
  ];

  for (const signature of [...publicCapabilities, ...authenticatedOnly, ...serviceOnly, "create_company_defaults()"]) {
    const escaped = signature.replace(/[()[\].+?^${}|]/g, "\\$&").replaceAll("*", "\\*");
    assert.match(migration, new RegExp(`alter function public\\.${escaped} set search_path = public, pg_temp`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated, service_role`));
  }
  for (const signature of publicCapabilities) {
    const escaped = signature.replace(/[()[\].+?^${}|]/g, "\\$&").replaceAll("*", "\\*");
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to anon, authenticated`));
  }
  for (const signature of authenticatedOnly) {
    const escaped = signature.replace(/[()[\].+?^${}|]/g, "\\$&").replaceAll("*", "\\*");
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated`));
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${escaped} to anon`));
  }
  for (const signature of serviceOnly) {
    const escaped = signature.replace(/[()[\].+?^${}|]/g, "\\$&").replaceAll("*", "\\*");
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to service_role`));
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${escaped} to (anon|authenticated)`));
  }
  for (const signature of droppedLegacy) {
    const escaped = signature.replace(/[()[\].+?^${}|]/g, "\\$&").replaceAll("*", "\\*");
    assert.match(migration, new RegExp(`drop function if exists public\\.${escaped}`));
  }
  assert.doesNotMatch(migration, /drop function[\s\S]*?cascade/i);
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.doesNotMatch(migration, /grant execute on function public\.create_company_defaults/);
});

test("service-role credentials are not imported by client components", async () => {
  const clientFiles = await sourceFiles("src");
  const contents = await Promise.all(clientFiles.map(async (path) => ({ path, content: await file(path) })));
  for (const { path, content } of contents.filter(({ content }) => content.startsWith('"use client"') || content.startsWith("'use client'"))) {
    assert.doesNotMatch(content, /@\/lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, path);
  }
});

test("onboarding only receives authenticated users without memberships by default and remains available for a demo organization", async () => {
  const home = await file("src/app/page.tsx");
  const onboarding = await file("src/app/onboarding/page.tsx");
  const layout = await file("src/app/(app)/app/[companySlug]/layout.tsx");
  const form = await file("src/features/onboarding/components/onboarding-form.tsx");
  assert.match(home, /redirect\(company \? `\/app\/\$\{company\.slug\}` : "\/onboarding"\)/);
  assert.match(onboarding, /if \(!user\) redirect\("\/login"\)/);
  assert.match(onboarding, /hasExistingOrganization=\{Boolean\(membership\)\}/);
  assert.match(layout, /href="\/onboarding"/);
  assert.match(form, /onboarding\.additionalDescription/);
});

test("Dutch is the fallback language and non-Dutch requests safely use Dutch messages", () => {
  assert.equal(getTranslations().language, "nl");
  assert.equal(getTranslations("en").language, "nl");
  assert.equal(getTranslations("de").t("navigation.quotes"), getTranslations("nl").t("navigation.quotes"));
});

test("supported language and locale contracts are explicitly bounded", () => {
  assert.deepEqual(supportedLanguages, ["nl", "en", "de", "es"]);
  assert.deepEqual(supportedLocales, ["nl-NL", "en-GB", "de-DE", "es-ES"]);
});

test("formatters respect their locale and EUR currency", () => {
  assert.equal(formatMoney(12_345, "en-GB", "EUR"), new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(123.45));
  assert.equal(formatDate("2026-07-21T00:00:00.000Z", "de-DE"), new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date("2026-07-21T00:00:00.000Z")));
});

test("organization context has separate safe Dutch defaults", () => {
  assert.deepEqual(getOrganizationContext("company-1"), {
    companyId: "company-1",
    language: defaultLanguage,
    locale: defaultLocale,
    currency: defaultCurrency,
  });
});

test("quote prompt gets explicit language and locale without AI price fields", async () => {
  const prompt = createQuoteSystemPrompt("nl", "nl-NL");
  const promptSource = await file("src/ai/prompts/generate-quote.ts");
  assert.match(prompt, /taal nl/);
  assert.match(prompt, /locale nl-NL/);
  assert.doesNotMatch(promptSource, /unitPriceCents|totalCents|vatPercent/);
});

test("Dutch quote route keeps catalog prices server-side and passes a language contract", async () => {
  const route = await file("src/app/api/v1/companies/[companyId]/quotes/generate/route.ts");
  assert.match(route, /getOrganizationContext\(companyId\)/);
  assert.match(route, /language: organization\.language/);
  assert.match(route, /locale: organization\.locale/);
  assert.match(route, /create_ai_quote_draft/);
  assert.doesNotMatch(route, /unitPriceCents|totalCents|vatPercent/);
});

test("NULL costs remain fail-closed in the architectural budget contract", async () => {
  const documentation = await file("docs/architecture/ai-cost-unknown-fail-closed.md");
  const snapshot: AiBudgetCostSnapshot = { status: AiBudgetStatus.Unknown, knownSpendCents: 0, unknownCostRunCount: 1 };
  assert.equal(calculateAiCost({ model: "unpriced", usage: {}, pricing: {}, usdEurRate: 0.9 }).estimatedCostCents, null);
  assert.equal(snapshot.status, "unknown");
  assert.match(documentation, /mag nooit als nul/i);
  assert.match(documentation, /geen nieuwe betaalde provider-aanroep/i);
});

test("WP13.3 validates conversation tenancy in routes and at the database boundary", async () => {
  const route = await file("src/app/api/v1/companies/[companyId]/conversations/[conversationId]/route.ts");
  const detailPage = await file("src/app/(app)/app/[companySlug]/conversations/[conversationId]/page.tsx");
  const migration = await file("supabase/migrations/20260805181838_030_enforce_conversation_tenant_integrity.sql");
  const publicQuestion = await file("supabase/migrations/023_quote_delivery_and_hashed_public_tokens.sql");

  // A company member can only resolve a conversation through its joint tenant key.
  assert.match(detailPage, /\.eq\("id", conversationId\)[\s\S]*?\.eq\("company_id", company\.id\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /\.from\("company_memberships"\)[\s\S]*?\.eq\("company_id", companyId\)[\s\S]*?\.eq\("user_id", user\.id\)/);
  assert.match(route, /\.from\("conversations"\)[\s\S]*?\.eq\("id", conversationId\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(route, /code: "CONVERSATION_NOT_FOUND"/);

  // A manipulated body cannot select a tenant; inserts only use the validated record.
  assert.doesNotMatch(route, /company_id:\s*input\.data/);
  assert.match(route, /conversation_id: access\.conversation\.id/);
  assert.match(route, /company_id: access\.conversation\.company_id/);
  assert.doesNotMatch(route, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);

  // Both writes use the joint validated key and an update must affect one row.
  assert.match(route, /\.eq\("id", access\.conversation\.id\)[\s\S]*?\.eq\("company_id", access\.conversation\.company_id\)/);
  assert.match(route, /updatedConversation\?\.length !== 1/);
  assert.match(route, /code: "CONVERSATION_UPDATE_FAILED"/);
  assert.doesNotMatch(route, /membership\.role === "technician"/);

  // The migration aborts on legacy corruption, preserves records, and adds the composite invariant.
  assert.match(migration, /CONVERSATION_TENANT_INTEGRITY_ORPHANS_FOUND/);
  assert.match(migration, /CONVERSATION_TENANT_INTEGRITY_MISMATCHES_FOUND/);
  assert.match(migration, /add constraint conversations_id_company_id_key unique \(id, company_id\)/);
  assert.match(migration, /drop constraint if exists conversation_messages_conversation_id_fkey/);
  assert.match(migration, /foreign key \(conversation_id, company_id\)[\s\S]*?references public\.conversations \(id, company_id\)/);
  assert.match(migration, /on update no action[\s\S]*?on delete cascade/);
  assert.match(migration, /create index if not exists conversation_messages_conversation_company_idx/);
  assert.doesNotMatch(migration, /drop\s+(?:constraint|table|function)[^;]*\bcascade\b/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.conversation_messages/i);
  assert.doesNotMatch(migration, /disable row level security/i);

  // Public quote questions derive both values from the same validated quote record.
  assert.match(publicQuestion, /conversation_id,[\s\S]*?target_quote\.company_id,[\s\S]*?'inbound'/);
});

test("RC1 derives conversation quote input server-side and stores only catalog-backed draft items", async () => {
  const route = await file("src/app/api/v1/companies/[companyId]/quotes/generate/route.ts");
  const detailPage = await file("src/app/(app)/app/[companySlug]/conversations/[conversationId]/page.tsx");
  const actions = await file("src/features/conversations/components/conversation-actions.tsx");
  const migration = await file("supabase/migrations/20260805181839_031_ai_conversation_quote_draft.sql");
  const customerReuseOverload = migration.slice(0, migration.indexOf("-- Keep free input compatible"));

  // Only the conversation id is sent by the browser; all customer and request data is read server-side.
  assert.match(actions, /JSON\.stringify\(\{ conversationId \}\)/);
  assert.doesNotMatch(actions, /customerName|customerEmail|requestText/);
  assert.match(route, /conversationInputSchema = z\.object\(\{ conversationId: z\.string\(\)\.uuid\(\) \}\)/);
  assert.match(route, /\.from\("conversations"\)[\s\S]*?\.eq\("id", conversationInput\.data\.conversationId\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(route, /\.from\("customers"\)[\s\S]*?\.eq\("id", conversation\.customer_id\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(route, /\.from\("conversation_messages"\)[\s\S]*?\.eq\("conversation_id", conversation\.id\)[\s\S]*?\.eq\("company_id", conversation\.company_id\)[\s\S]*?\.in\("direction", \["inbound", "outbound"\]\)/);
  assert.match(route, /buildConversationRequestText\(conversation\.subject, messages \?\? \[\]\)/);

  // The UI hides it from technicians, while the route independently enforces the same role boundary.
  assert.match(detailPage, /membership\?\.role === "owner" \|\| membership\?\.role === "employee"/);
  assert.match(route, /!membership \|\| membership\.role === "technician"/);

  // Only exact active catalog matches are forwarded to the draft RPC; unmatched AI text remains a warning.
  assert.match(route, /catalogByName\.get\(normalizeCatalogName\(item\.catalogItemName \?\? item\.description/);
  assert.match(route, /if \(!matchedCatalogItem\) return \[\]/);
  assert.match(route, /Niet opgenomen \(geen exact actief catalogusproduct\)/);
  assert.match(route, /if \(draftItems\.length === 0\) throw new AiValidationError/);
  assert.doesNotMatch(route, /catalogItemId: matchedCatalogItem\?\.id \?\? null/);

  // The new overload reuses a tenant-scoped customer, validates every catalog item, and gets prices from the catalog.
  assert.match(migration, /create or replace function public\.create_ai_quote_draft\([\s\S]*?target_customer_id uuid/);
  assert.match(migration, /where id = target_customer_id and company_id = target_company_id/);
  assert.doesNotMatch(customerReuseOverload, /insert into public\.customers/);
  assert.match(migration, /nullif\(item->>'catalogItemId', ''\) is null/);
  assert.match(migration, /where id = requested_catalog_item_id and company_id = target_company_id and is_active = true/);
  assert.match(migration, /catalog_item\.unit, catalog_item\.default_unit_price_cents, catalog_item\.default_vat_rate/);
  assert.doesNotMatch(migration, /item_price_cents := 0/);
  assert.match(migration, /security definer[\s\S]*?set search_path = public, pg_temp/);
  assert.match(migration, /grant execute on function public\.create_ai_quote_draft\(uuid, uuid, text, text, jsonb\) to authenticated/);
  assert.match(migration, /return public\.create_ai_quote_draft\([\s\S]*?new_customer_id/);

  // Conversation flow calls the customer-reuse overload while free input retains its existing contract.
  assert.match(route, /target_customer_id: source\.customerId/);
  assert.match(route, /customer_name: source\.customerName/);
  assert.match(actions, /router\.push/);
  assert.match(actions, /quotes\/\$\{payload\.quoteId\}/);
});

test("RC1 mock output chooses an exact catalog name instead of a zero-price placeholder", async () => {
  const provider = await file("src/ai/providers/openai-provider.ts");
  assert.match(provider, /function mockCatalogItemName/);
  assert.match(provider, /Beschikbare catalogusproducten \(zonder prijzen\)/);
  assert.match(provider, /items: \[\{ description: catalogItemName, catalogItemName, quantity: 1, unit: "stuk" \}\]/);
});

test("WP7.2B.2 stores a required immutable service date only for new invoices", async () => {
  const migration = await file("supabase/migrations/20260805181840_032_invoice_service_date_and_vat_specification.sql");
  const invoiceRoute = await file("src/app/api/v1/companies/[companyId]/quotes/[quoteId]/invoice/route.ts");
  const createButton = await file("src/features/quotes/components/create-invoice-button.tsx");
  const immutability = await file("supabase/migrations/024_invoice_integrity_and_numbering.sql");

  assert.match(migration, /alter table public\.invoices add column if not exists service_date date/);
  assert.doesNotMatch(migration, /update public\.invoices[\s\S]*service_date/i);
  assert.match(migration, /target_service_date date default null/);
  assert.match(migration, /message = 'INVOICE_SERVICE_DATE_REQUIRED'/);
  assert.match(migration, /invoice_date, service_date, created_by/);
  assert.match(migration, /current_date, target_service_date, auth\.uid\(\)/);
  assert.match(migration, /drop function public\.create_invoice_from_quote\(uuid, uuid\)/);
  assert.match(migration, /has_company_role\(target_company_id, array\['owner', 'employee'\]/);
  assert.match(migration, /where id = target_quote_id and company_id = target_company_id[\s\S]*for update/);
  assert.match(migration, /select new_invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate, line_total_cents/);
  assert.match(immutability, /to_jsonb\(new\) - array\['status', 'sent_at', 'paid_at', 'voided_at', 'void_reason', 'updated_at'\]/);
  assert.doesNotMatch(immutability, /'service_date'/);

  assert.match(invoiceRoute, /serviceDate: z\.string\(\)\.regex/);
  assert.match(invoiceRoute, /target_service_date: input\.data\.serviceDate/);
  assert.match(invoiceRoute, /INVOICE_SERVICE_DATE_REQUIRED/);
  assert.match(createButton, /type="date"/);
  assert.match(createButton, /JSON\.stringify\(\{ serviceDate \}\)/);
});

test("WP7.2B.2 calculates VAT groups from immutable invoice item snapshots", async () => {
  assert.deepEqual(calculateVatSpecification([{ vatRate: 21, lineTotalCents: 10_000 }], 2_100), [
    { vatRate: 21, taxableBaseCents: 10_000, taxCents: 2_100 },
  ]);
  assert.deepEqual(calculateVatSpecification([{ vatRate: 9, lineTotalCents: 5_000 }], 450), [
    { vatRate: 9, taxableBaseCents: 5_000, taxCents: 450 },
  ]);
  assert.deepEqual(calculateVatSpecification([
    { vatRate: 21, lineTotalCents: 10_000 },
    { vatRate: 9, lineTotalCents: 5_000 },
  ], 2_550), [
    { vatRate: 21, taxableBaseCents: 10_000, taxCents: 2_100 },
    { vatRate: 9, taxableBaseCents: 5_000, taxCents: 450 },
  ]);
  assert.deepEqual(calculateVatSpecification([
    { vatRate: 21, lineTotalCents: 1 },
    { vatRate: 21, lineTotalCents: 1 },
    { vatRate: 21, lineTotalCents: 1 },
  ], 0), [{ vatRate: 21, taxableBaseCents: 3, taxCents: 0 }]);

  const pdfRoute = await file("src/app/api/v1/companies/[companyId]/invoices/[invoiceId]/pdf/route.ts");
  const pdf = await file("src/features/invoices/infrastructure/invoice-pdf.tsx");
  assert.match(pdfRoute, /service_date/);
  assert.match(pdfRoute, /serviceDate: invoice\.service_date/);
  assert.match(pdf, /calculateVatSpecification\(invoice\.items, invoice\.taxCents\)/);
  assert.match(pdf, /Leverdatum/);
  assert.match(pdf, /BTW-specificatie/);
  assert.match(pdf, /BTW totaal/);
  assert.doesNotMatch(pdfRoute, /product_catalog_items|from\("companies"\)|from\("customers"\)/);
});

test("WP13.4 keeps optional document customers tenant-bound in the route and database", async () => {
  const route = await file("src/app/api/v1/companies/[companyId]/documents/upload-url/route.ts");
  const migration = await file("supabase/migrations/20260808154044_033_document_tenant_integrity.sql");

  // A member of the route company is required before any customer lookup or write.
  assert.match(route, /.from\("company_memberships"\)[\s\S]*?\.eq\("company_id", companyId\)[\s\S]*?\.eq\("user_id", user\.id\)/);
  assert.match(route, /if \(!membership\) return NextResponse\.json\([\s\S]*?status: 403/);

  // A client customer id is only accepted after an id + company lookup; NULL stays valid.
  assert.match(route, /if \(input\.data\.customerId\)[\s\S]*?\.from\("customers"\)[\s\S]*?\.eq\("id", input\.data\.customerId\)[\s\S]*?\.eq\("company_id", companyId\)/);
  assert.match(route, /let validatedCustomerId: string \| null = null/);
  assert.match(route, /customer_id: validatedCustomerId/);
  assert.doesNotMatch(route, /customer_id: input\.data\.customerId \?\? null/);
  assert.match(route, /Klant niet gevonden voor deze organisatie/);

  // The route alone cannot choose a tenant path or bypass Storage through service role.
  assert.match(route, /const path = `\$\{companyId\}\/\$\{documentId\}\/\$\{safeName\}`/);
  assert.match(route, /storage\.from\("company-documents"\)\.createSignedUploadUrl\(path\)/);
  assert.doesNotMatch(route, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);

  // The database rejects both cross-tenant and orphan links, while nullable customer_id remains legal.
  assert.match(migration, /DOCUMENT_CUSTOMER_INTEGRITY_ORPHANS_FOUND/);
  assert.match(migration, /DOCUMENT_CUSTOMER_TENANT_MISMATCHES_FOUND/);
  assert.match(migration, /customers_id_company_id_key unique \(id, company_id\)/);
  assert.match(migration, /foreign key \(customer_id, company_id\)[\s\S]*?references public\.customers \(id, company_id\)/);
  assert.match(migration, /on update no action[\s\S]*?on delete set null \(customer_id\)/);
  assert.match(migration, /drop constraint if exists documents_customer_id_fkey/);
  assert.doesNotMatch(migration, /drop cascade/i);
});

test("OR1 health endpoint is read-only, bounded and never returns Supabase configuration", async () => {
  const route = await file("src/app/api/health/route.ts");
  const databaseCheck = await file("src/lib/health/server.ts");

  assert.match(route, /export async function GET/);
  assert.match(route, /status: "ok"/);
  assert.match(route, /checks: \{ app: "ok", database: "ok" \}/);
  assert.match(route, /status: 503/);
  assert.match(route, /checks: \{ app: "ok", database: "error" \}/);
  assert.match(route, /checkDatabaseHealth/);
  assert.doesNotMatch(route, /SUPABASE_|OPENAI_|process\.env|project[-_]?ref|stack/i);
  assert.match(databaseCheck, /AbortController/);
  assert.match(databaseCheck, /HEALTH_TIMEOUT_MS = 2_000/);
  assert.match(databaseCheck, /from\("companies"\)\.select\("id", \{ head: true, count: "exact" \}\)\.limit\(1\)/);
  assert.doesNotMatch(databaseCheck, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("OR1 logger keeps only structured operational fields and redacts sensitive context", () => {
  const sanitized = sanitizeLogContext({ authorization: "Bearer secret", rawToken: "token", email: "person@example.test", requestId: "safe-id", nested: { signedUrl: "https://sensitive.example" } }) as Record<string, unknown>;
  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.rawToken, "[REDACTED]");
  assert.equal(sanitized.email, "[REDACTED]");
  assert.equal(sanitized.requestId, "safe-id");
  assert.deepEqual(sanitized.nested, { signedUrl: "[REDACTED]" });
});

test("OR1 accepts mock mode without live OpenAI configuration and rejects invalid configuration", () => {
  const mock = readRuntimeConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-key",
    AI_MODE: "mock",
  });
  assert.equal(mock.aiMode, "mock");
  assert.throws(() => readRuntimeConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "key", AI_MODE: "invalid" }), RuntimeConfigError);
  assert.throws(() => readRuntimeConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "key", AI_MODE: "live" }), RuntimeConfigError);
});

test("OR1 adds a request-id and safe structured error handling to critical routes", async () => {
  const criticalRoutes = [
    "src/app/api/v1/companies/[companyId]/quotes/generate/route.ts",
    "src/app/api/v1/companies/[companyId]/quotes/[quoteId]/publish/route.ts",
    "src/app/api/v1/companies/[companyId]/quotes/[quoteId]/email/route.ts",
    "src/app/api/v1/companies/[companyId]/quotes/[quoteId]/invoice/route.ts",
    "src/app/api/v1/companies/[companyId]/invoices/[invoiceId]/status/route.ts",
    "src/app/api/v1/companies/[companyId]/conversations/[conversationId]/route.ts",
    "src/app/api/v1/companies/[companyId]/documents/upload-url/route.ts",
  ];
  for (const path of criticalRoutes) {
    const source = await file(path);
    assert.match(source, /withApiRequest\(/, path);
    assert.match(source, /logServerEvent\(/, path);
  }

  const observability = await file("src/lib/observability/server.ts");
  const boundary = await file("src/app/error.tsx");
  assert.match(observability, /x-request-id/);
  assert.match(observability, /safeErrorResponse/);
  assert.doesNotMatch(observability, /console\.error\(error\)/);
  assert.match(boundary, /"use client"/);
  assert.match(boundary, /Opnieuw proberen/);
  assert.doesNotMatch(boundary, /error\.message|error\.stack/);
});
