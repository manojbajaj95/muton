import { searchCards } from "../../search/index.ts";
import { CardStore } from "../../store/index.ts";

export function cmdSearch(args: string[]): void {
  const json = args.includes("--json");
  const query = args
    .filter((a) => a !== "--json")
    .join(" ")
    .trim();
  if (!query) {
    console.error("Usage: muton search [--json] <query>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const result = searchCards(store, query, { k: 5 });
    if (json) {
      console.log(
        JSON.stringify({
          hits: result.hits.map((h) => ({
            slug: h.slug,
            title: h.title,
            use_when: h.use_when,
            score: h.score,
          })),
          context: result.context,
        }),
      );
      return;
    }
    if (result.hits.length === 0) {
      console.log("No cards found.");
      return;
    }
    for (const h of result.hits) {
      console.log(`- ${h.title} (${h.slug}) score=${h.score.toFixed(2)}`);
      console.log(`  use_when: ${h.use_when}`);
    }
  } finally {
    store.close();
  }
}
