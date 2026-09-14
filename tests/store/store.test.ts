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
});
