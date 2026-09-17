import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toFtsQuery } from "../../src/retrieval/query.ts";
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
    expect(q).toContain('"stripe"*');
    expect(q).toContain('"webhook"*');
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

  test("ignores generic Muton prompt vocabulary", () => {
    home = mkdtempSync(join(tmpdir(), "muton-search-generic-"));
    store = new CardStore(home);
    store.writeNew({
      title: "Reflection subprocess isolation",
      use_when: "Debugging recursive hooks during reflection",
      body: "Muton includes project context in the extraction prompt.",
    });
    store.writeNew({
      title: "Node-only distribution smoke check",
      use_when: "Validating Muton packaging",
      body: "The package smoke check creates a Card.",
    });

    const { hits } = searchCards(
      store,
      "Muton currently generates card. Check what is the refelction prompt?",
    );
    expect(hits.map((hit) => hit.title)).toEqual(["Reflection subprocess isolation"]);
  });

  test("does not exhaust the result count with generic Card matches", () => {
    home = mkdtempSync(join(tmpdir(), "muton-search-injected-"));
    store = new CardStore(home);
    store.writeNew({
      title: "Card injection budget",
      use_when: "Debugging injection completeness",
      body: "Only Cards actually injected should be marked delivered.",
    });
    store.writeNew({
      title: "Release automation",
      use_when: "Changing Muton releases",
      body: "Release metadata is stored in the repository.",
    });

    const { hits } = searchCards(
      store,
      "Review the cards injected by Muton in this session. Are they relevant?",
    );
    expect(hits.map((hit) => hit.title)).toEqual(["Card injection budget"]);
  });

  test("returns only hits that fit in the context budget", () => {
    home = mkdtempSync(join(tmpdir(), "muton-search-budget-"));
    store = new CardStore(home);
    store.writeNew({
      title: "Stripe alpha",
      use_when: "Stripe alpha",
      body: "A".repeat(200),
    });
    store.writeNew({
      title: "Stripe beta",
      use_when: "Stripe beta",
      body: "B".repeat(200),
    });

    const result = searchCards(store, "stripe", { maxChars: 180 });
    expect(result.context).toBe("");
    expect(result.hits).toEqual([]);
  });
});
