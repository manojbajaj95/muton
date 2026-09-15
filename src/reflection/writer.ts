import type { Card } from "../cards/index.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";

export type WriteResult = {
  written: Card[];
  skipped: string[];
};

/** Upsert proposals; skip only invalid rows. Near-duplicates update in place. */
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
    written.push(store.upsert({ title, use_when: useWhen, body }));
  }
  return { written, skipped };
}
