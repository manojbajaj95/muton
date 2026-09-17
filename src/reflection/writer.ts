import type { Card } from "../cards/index.ts";
import type { CardStore, ProposeInput } from "../store/index.ts";

export type WriteResult = {
  created: Card[];
  merged: Card[];
  equivalent: Card[];
};

export function writeProposedCards(store: CardStore, proposals: ProposeInput[]): WriteResult {
  const result: WriteResult = { created: [], merged: [], equivalent: [] };
  for (const proposal of proposals) {
    const upsert = store.upsertDetailed(proposal);
    result[upsert.action].push(upsert.card);
  }
  return result;
}
