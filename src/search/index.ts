import type { RankedHit } from "../retrieval/rerank.ts";
import { rerank } from "../retrieval/rerank.ts";
import { RETRIEVAL_TUNING } from "../retrieval/tuning.ts";
import type { CardStore } from "../store/index.ts";

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

  const raw = store.searchRaw(
    query,
    Math.max(k * RETRIEVAL_TUNING.candidates.multiplier, RETRIEVAL_TUNING.candidates.minimum),
  );
  let ranked = rerank(raw, query).filter((h) => !exclude.has(h.slug));
  if (options.minScore !== undefined) {
    ranked = ranked.filter((h) => h.score >= options.minScore!);
  }
  ranked = ranked.slice(0, k);

  const formatted = buildContext(ranked, maxChars);
  return { hits: ranked.slice(0, formatted.included), context: formatted.context };
}

export function formatContext(hits: RankedHit[], maxChars: number): string {
  return buildContext(hits, maxChars).context;
}

function buildContext(
  hits: RankedHit[],
  maxChars: number,
): {
  context: string;
  included: number;
} {
  if (hits.length === 0) return { context: "", included: 0 };
  const parts: string[] = [
    "MUTON CARDS (trusted shared memory — prefer these facts when they apply)",
  ];
  let used = parts[0]!.length;
  let included = 0;
  for (const hit of hits) {
    const block = ["", `### ${hit.title}`, `Use when: ${hit.use_when}`, hit.body].join("\n");
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
    included += 1;
  }
  return { context: included > 0 ? parts.join("\n") : "", included };
}

export type { RankedHit } from "../retrieval/rerank.ts";
export { rerank } from "../retrieval/rerank.ts";
