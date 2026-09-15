import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardStore } from "../../src/store/index.ts";

describe("CardStore", () => {
  let home: string;
  let store: CardStore;

  afterEach(() => {
    store?.close();
    if (home) rmSync(home, { recursive: true, force: true });
  });

  test("writes unique slugs and searches", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const a = store.writeNew({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP responses",
      body: "Read JSON error even when status is 200.",
    });
    const b = store.writeNew({
      title: "Stripe rate limit returns 200",
      use_when: "duplicate title",
      body: "Second card with same title.",
    });
    expect(a.slug).toBe("stripe-rate-limit-returns-200");
    expect(b.slug).toBe("stripe-rate-limit-returns-200-2");
    const hits = store.searchRaw("stripe rate limit");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.slug === a.slug)).toBe(true);
  });

  test("upsert updates a matching title in place", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const created = new Date("2026-01-01T00:00:00.000Z");
    const first = store.upsert(
      {
        title: "Stripe rate limit returns 200",
        use_when: "Stripe HTTP responses",
        body: "Read JSON error even when status is 200.",
      },
      created,
    );
    const later = new Date("2026-01-02T00:00:00.000Z");
    const second = store.upsert(
      {
        title: "Stripe rate limit returns 200",
        use_when: "Stripe HTTP 200 bodies",
        body: "Parse the error field before treating 2xx as success.",
      },
      later,
    );
    expect(second.slug).toBe(first.slug);
    expect(second.body).toContain("error field");
    expect(second.use_when).toBe("Stripe HTTP 200 bodies");
    expect(second.created_at).toBe(first.created_at);
    expect(second.updated_at).toBe(later.toISOString());
    expect(store.cardCount()).toBe(1);
    expect(store.read(first.slug)?.body).toContain("error field");
  });

  test("upsert writes a new card when titles and content differ", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    store.upsert({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP",
      body: "Check JSON error on 200.",
    });
    const other = store.upsert({
      title: "Postgres store timestamps in UTC",
      use_when: "Database timestamps",
      body: "Always write TIMESTAMPTZ.",
    });
    expect(other.slug).toBe("postgres-store-timestamps-in-utc");
    expect(store.cardCount()).toBe(2);
  });

  test("upsert updates when titles differ but content overlaps", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const first = store.upsert({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP responses",
      body: "Read JSON error even when status is 200.",
    });
    const second = store.upsert({
      title: "Stripe 200 error body",
      use_when: "Handling Stripe HTTP",
      body: "Read JSON error even when status is 200.",
    });
    expect(second.slug).toBe(first.slug);
    expect(second.title).toBe("Stripe 200 error body");
    expect(store.cardCount()).toBe(1);
  });
});
