import type { FtsHit } from "../store/sqlite.ts";
import { tokenize } from "./query.ts";
import { RETRIEVAL_TUNING } from "./tuning.ts";

export type RankedHit = FtsHit & { score: number };

/** Rerank FTS candidates using the central retrieval tuning. */
export function rerank(hits: FtsHit[], query: string): RankedHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const tuning = RETRIEVAL_TUNING.ranking;
  const distinctive = terms.filter((term) => term.length >= tuning.distinctiveTermMinLength);
  const coverageTerms = distinctive.length > 0 ? distinctive : terms;
  const minMatches =
    coverageTerms.length >= tuning.multiTermThreshold ? tuning.multiTermMinMatches : 1;
  const now = Date.now();
  const ranked: RankedHit[] = [];

  for (const hit of hits) {
    const title = new Set(tokenize(hit.title, Number.POSITIVE_INFINITY));
    const useWhen = new Set(tokenize(hit.use_when, Number.POSITIVE_INFINITY));
    const body = new Set(tokenize(hit.body, Number.POSITIVE_INFINITY));
    const coverage = new Set(coverageTerms);
    let boost = 0;
    let matched = 0;
    let cueMatched = false;
    for (const term of terms) {
      if (!title.has(term) && !useWhen.has(term) && !body.has(term)) continue;
      if (coverage.has(term)) matched += 1;
      if (title.has(term)) {
        boost += tuning.titleBoost;
        cueMatched = true;
      }
      if (useWhen.has(term)) {
        boost += tuning.useWhenBoost;
        cueMatched = true;
      }
    }
    if (matched < minMatches || (!cueMatched && matched < tuning.bodyOnlyMinMatches)) continue;
    const ageMs = Math.max(0, now - Date.parse(hit.updated_at || hit.created_at));
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recency = Math.max(0, 1 - ageDays / tuning.recencyWindowDays);
    ranked.push({
      ...hit,
      score: -hit.bm25 + boost + recency * tuning.recencyBoost + matched * tuning.matchBoost,
    });
  }

  return ranked.sort((a, b) => b.score - a.score);
}
