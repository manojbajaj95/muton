import type { Card } from "../cards/index.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";

export type WriteResult = {
  written: Card[];
  skipped: string[];
};

/** Skip near-duplicate titles via FTS; write new cards. */
export function writeProposedCards(store: CardStore, proposals: ProposeInput[]): WriteResult {
  const written: Card[] = [];
  const skipped: string[] = [];

  for (const proposal of proposals) {
    const title = proposal.title?.trim();
    const useWhen = proposal.use_when?.trim();
    const body = proposal.body?.trim();
    if (!title || !useWhen || !body) {
      skipped.push(title || "(invalid)");
      continue;
    }
    const hits = store.searchRaw(title, 5);
    const dup = hits.some(
      (h) => h.title.toLowerCase() === title.toLowerCase() || tokenOverlap(h.title, title) > 0.8,
    );
    if (dup) {
      skipped.push(title);
      continue;
    }
    written.push(store.writeNew({ title, use_when: useWhen, body }));
  }
  return { written, skipped };
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}
