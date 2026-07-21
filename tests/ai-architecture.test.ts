import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { calculateAiCost } from "../src/ai/costs.ts";
import { AiErrorCode, AiRateLimitError, AiTimeoutError, getAiErrorCode } from "../src/ai/errors.ts";
import { executeAiRun } from "../src/ai/gateway-core.ts";

const file = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

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

test("a provider failure creates one failed AI run", async () => {
  const finished: Array<{ runId: string; status: string; durationMs: number; currency: "EUR"; errorCode?: string }> = [];
  await assert.rejects(
    executeAiRun(
      { companyId: "company", userId: "user", feature: "quote_generation", systemPrompt: "system", userPrompt: "input", schema: { safeParse: () => ({ success: true, data: {} }) } as never },
      {
        provider: { name: "openai", generate: async () => { throw new AiRateLimitError("rate limited"); } },
        runs: {
          start: async () => "run-1",
          finish: async (entry) => { finished.push(entry); },
        },
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
    await executeAiRun(
      { companyId: "company", userId: "user", feature: "quote_generation", systemPrompt: "system", userPrompt: "input", schema: { safeParse: () => ({ success: true, data: {} }) } as never },
      {
        provider: { name: "openai", generate: async () => ({ data: {}, provider: "openai" as const, model: "known-model", usage: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 } }) } as never,
        runs: { start: async () => "run-2", finish: async (entry) => { finished.push(entry); } },
      },
    );
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

test("migration keeps quote storage atomic and catalog prices authoritative", async () => {
  const migration = await file("supabase/migrations/014_sprint_1_25_architecture_hardening.sql");
  assert.match(migration, /drop function if exists public\.finish_ai_run\(uuid, public\.ai_run_status, uuid, text, integer, integer, text\)/);
  assert.match(migration, /create function public\.create_ai_quote_draft/);
  assert.match(migration, /item_price_cents := catalog_item\.default_unit_price_cents/);
  assert.match(migration, /item_price_cents := 0/);
  assert.match(migration, /insert into public\.customers[\s\S]*insert into public\.quotes[\s\S]*insert into public\.quote_items/);
});

test("public quote routes reject malformed input without provider error details", async () => {
  const route = await file("src/app/api/public/quotes/[token]/route.ts");
  const page = await file("src/app/offerte/[token]/page.tsx");
  assert.match(route, /const tokenSchema = z\.string\(\)\.uuid\(\)/);
  assert.match(route, /z\.literal\("question"\), comment: z\.string\(\)\.trim\(\)\.min\(2\)\.max\(2000\)/);
  assert.doesNotMatch(route, /error\?\.message/);
  assert.match(page, /z\.string\(\)\.uuid\(\)\.safeParse\(token\)/);
});

test("a public token selects exactly one unexpired quote and exposes no internal quote id", async () => {
  const migration = await file("supabase/migrations/015_public_quote_security_hardening.sql");
  assert.match(migration, /where q\.public_token = token[\s\S]*q\.public_token_expires_at > now\(\)/);
  assert.match(migration, /where qi\.quote_id = q\.id/);
  assert.doesNotMatch(migration, /'id', q\.id/);
  assert.doesNotMatch(migration, /customerComment/);
});

test("AI admin mutations require service role and the initiating tenant membership", async () => {
  const admin = await file("src/lib/supabase/admin.ts");
  const migration = await file("supabase/migrations/014_sprint_1_25_architecture_hardening.sql");
  assert.match(admin, /import "server-only"/);
  assert.match(admin, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_(SERVICE_ROLE|SECRET)_KEY/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /company_id = target_company_id and user_id = target_initiated_by/);
  assert.match(migration, /grant execute on function public\.start_ai_run[\s\S]* to service_role/);
});

test("service-role credentials are not imported by client components", async () => {
  const clientFiles = await sourceFiles("src");
  const contents = await Promise.all(clientFiles.map(async (path) => ({ path, content: await file(path) })));
  for (const { path, content } of contents.filter(({ content }) => content.startsWith('"use client"') || content.startsWith("'use client'"))) {
    assert.doesNotMatch(content, /@\/lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, path);
  }
});
