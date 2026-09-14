import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchCards } from "../../src/search/index.ts";
import { CardStore } from "../../src/store/index.ts";

describe("search", () => {
  let home: string;
  let store: CardStore;

  afterEach(() => {
    store?.close();
    if (home) rmSync(home, { recursive: true, force: true });
  });

  test("reranks title matches first", () => {
    home = mkdtempSync(join(tmpdir(), "muton-search-"));
    store = new CardStore(home);
    store.writeNew({
      title: "Postgres TIMESTAMP WITH TIME ZONE",
      use_when: "Reading DB timestamps",
      body: "Always store UTC.",
    });
    store.writeNew({
      title: "Stripe webhook retries",
      use_when: "Stripe webhooks",
      body: "Idempotency keys required.",
    });
    const { hits, context } = searchCards(store, "stripe webhook", { k: 5 });
    expect(hits[0]?.title.toLowerCase()).toContain("stripe");
    expect(context).toContain("MUTON CARDS");
  });
});
