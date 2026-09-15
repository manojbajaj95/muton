import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toFtsQuery } from "../../src/search/bm25.ts";
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

  test("toFtsQuery keeps later terms and drops filler", () => {
    const q = toFtsQuery(
      "Can you please look at this and tell me how we should handle the stripe webhook",
    );
    expect(q).toContain('"stripe"');
    expect(q).toContain('"webhook"');
    expect(q).not.toContain('"the"');
    expect(q).not.toContain('"please"');
    expect(q).not.toContain('"you"');
  });

  test("long prompt does not return unrelated cards", () => {
    home = mkdtempSync(join(tmpdir(), "muton-search-rel-"));
    store = new CardStore(home);
    store.writeNew({
      title: "Postgres TIMESTAMP WITH TIME ZONE",
      use_when: "Reading DB timestamps",
      body: "Always store UTC. The database should use timestamptz.",
    });
    store.writeNew({
      title: "Retry failed HTTP calls",
      use_when: "Handling transient errors",
      body: "Look at the status and tell the caller to retry.",
    });
    store.writeNew({
      title: "Stripe webhook retries",
      use_when: "Stripe webhooks",
      body: "Idempotency keys required.",
    });
    const { hits } = searchCards(
      store,
      "Can you please look at this and tell me how we should handle the stripe webhook retries",
      { k: 5 },
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title.toLowerCase()).toContain("stripe");
    expect(hits.every((h) => h.title.toLowerCase().includes("stripe"))).toBe(true);
  });
});
