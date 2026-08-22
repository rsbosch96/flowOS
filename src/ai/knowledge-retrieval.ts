export const knowledgeSourceTypes = ["manual", "faq"] as const;

export type KnowledgeSourceType = (typeof knowledgeSourceTypes)[number];

export type KnowledgeSearchEntry = {
  id: string;
  title: string;
  content: string;
  source_type: KnowledgeSourceType;
  updated_at: string;
};

export const KNOWLEDGE_QUERY_MAX_LENGTH = 500;
export const KNOWLEDGE_RESULT_LIMIT = 5;
export const KNOWLEDGE_SCAN_LIMIT = 50;
export const KNOWLEDGE_CONTEXT_ENTRY_MAX_LENGTH = 1200;

export function normalizeKnowledgeQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, KNOWLEDGE_QUERY_MAX_LENGTH);
}

export function tokenizeKnowledgeQuery(value: string) {
  return normalizeKnowledgeQuery(value).toLocaleLowerCase("nl-NL").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Small deterministic lexical ranking. It is deliberately not presented as an
 * AI confidence score: title matches win, content matches support them, and
 * id/updated_at provide stable tie-breaking only.
 */
export function rankKnowledgeEntries(
  entries: KnowledgeSearchEntry[],
  query: string,
  limit = KNOWLEDGE_RESULT_LIMIT,
) {
  const normalized = normalizeKnowledgeQuery(query).toLocaleLowerCase("nl-NL");
  const tokens = tokenizeKnowledgeQuery(query);
  if (!normalized || tokens.length === 0) return [];

  const ranked = entries.map((entry) => {
    const title = entry.title.toLocaleLowerCase("nl-NL");
    const content = entry.content.toLocaleLowerCase("nl-NL");
    let score = 0;
    if (title.includes(normalized)) score += 8;
    if (content.includes(normalized)) score += 2;
    for (const token of tokens) {
      if (title.includes(token)) score += 4;
      if (content.includes(token)) score += 1;
    }
    return { entry, score };
  }).filter((item) => item.score > 0);

  return ranked
    .sort((left, right) => right.score - left.score
      || right.entry.updated_at.localeCompare(left.entry.updated_at)
      || left.entry.id.localeCompare(right.entry.id))
    .slice(0, Math.max(1, Math.min(limit, KNOWLEDGE_RESULT_LIMIT)))
    .map(({ entry }) => entry);
}
