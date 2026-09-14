import type { FtsHit } from "../store/sqlite.ts";

export type RankedHit = FtsHit & { score: number };

/**
 * Rerank BM25 hits with title/use_when term boost and mild recency.
 * Lower BM25 is better; we invert into a higher-is-better score.
 */
export function rerank(hits: FtsHit[], query: string): RankedHit[] {
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const now = Date.now();

  return hits
    .map((hit) => {
      const title = hit.title.toLowerCase();
      const useWhen = hit.use_when.toLowerCase();
      let boost = 0;
      for (const term of terms) {
        if (title.includes(term)) boost += 2;
        if (useWhen.includes(term)) boost += 1.5;
      }
      const ageMs = Math.max(0, now - Date.parse(hit.updated_at || hit.created_at));
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recency = Math.max(0, 1 - ageDays / 365);
      // bm25 is negative/lower-better in SQLite; negate for ranking
      const score = -hit.bm25 + boost + recency * 0.5;
      return { ...hit, score };
    })
    .sort((a, b) => b.score - a.score);
}
