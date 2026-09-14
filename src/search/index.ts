import type { CardStore } from "../store/index.ts";
import type { RankedHit } from "./rerank.ts";
import { rerank } from "./rerank.ts";

export type SearchOptions = {
  k?: number;
  maxChars?: number;
  minScore?: number;
  excludeSlugs?: Set<string>;
};

export type SearchResult = {
  hits: RankedHit[];
  context: string;
};

const DEFAULT_K = 5;
const DEFAULT_MAX_CHARS = 6000;

/** Search Cards with BM25 then rerank; format injection context. */
export function searchCards(
  store: CardStore,
  query: string,
  options: SearchOptions = {},
): SearchResult {
  const k = options.k ?? DEFAULT_K;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const exclude = options.excludeSlugs ?? new Set<string>();

  if (!query.trim() || store.cardCount() === 0) {
    return { hits: [], context: "" };
  }

  const raw = store.searchRaw(query, Math.max(k * 4, 20));
  let ranked = rerank(raw, query).filter((h) => !exclude.has(h.slug));
  if (options.minScore !== undefined) {
    ranked = ranked.filter((h) => h.score >= options.minScore!);
  }
  ranked = ranked.slice(0, k);

  const context = formatContext(ranked, maxChars);
  return { hits: ranked, context };
}

export function formatContext(hits: RankedHit[], maxChars: number): string {
  if (hits.length === 0) return "";
  const parts: string[] = [
    "MUTON CARDS (trusted shared memory — prefer these facts when they apply)",
  ];
  let used = parts[0]!.length;
  for (const hit of hits) {
    const block = ["", `### ${hit.title}`, `Use when: ${hit.use_when}`, hit.body].join("\n");
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n");
}

export type { RankedHit } from "./rerank.ts";
export { rerank } from "./rerank.ts";
