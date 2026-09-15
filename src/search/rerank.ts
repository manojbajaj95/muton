import type { FtsHit } from "../store/sqlite.ts";
import { tokenize } from "./bm25.ts";

export type RankedHit = FtsHit & { score: number };

/**
 * Rerank BM25 hits with title/use_when term boost and mild recency.
 * Lower BM25 is better; we invert into a higher-is-better score.
 * Drops hits that only share a weak leftover term with a multi-term query.
 */
export function rerank(hits: FtsHit[], query: string): RankedHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const distinctive = terms.filter((t) => t.length >= 5);
  const coverageTerms = distinctive.length > 0 ? distinctive : terms;
  const minMatches = coverageTerms.length >= 3 ? 2 : 1;
  const now = Date.now();
  const ranked: RankedHit[] = [];

  for (const hit of hits) {
    const title = hit.title.toLowerCase();
    const useWhen = hit.use_when.toLowerCase();
    const hay = `${title} ${useWhen} ${hit.body.toLowerCase()}`;
    const coverage = new Set(coverageTerms);
    let boost = 0;
    let matched = 0;
    for (const term of terms) {
      if (!hay.includes(term)) continue;
      if (coverage.has(term)) matched += 1;
      if (title.includes(term)) boost += 2;
      if (useWhen.includes(term)) boost += 1.5;
    }
    if (matched < minMatches) continue;
    const ageMs = Math.max(0, now - Date.parse(hit.updated_at || hit.created_at));
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 1 - ageDays / 365);
    // bm25 is negative/lower-better in SQLite; negate for ranking
    ranked.push({ ...hit, score: -hit.bm25 + boost + recency * 0.5 + matched });
  }

  return ranked.sort((a, b) => b.score - a.score);
}
