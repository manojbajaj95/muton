import { describe, expect, test } from "bun:test";
import { parseCard, serializeCard, slugify } from "../../src/cards/index.ts";

describe("slugify", () => {
  test("slugifies titles", () => {
    expect(slugify("Stripe rate limit returns 200")).toBe("stripe-rate-limit-returns-200");
  });

  test("falls back for empty", () => {
    expect(slugify("!!!")).toBe("card");
  });
});

describe("card frontmatter", () => {
  test("round-trips", () => {
    const markdown = serializeCard({
      title: "Stripe rate limit returns 200",
      use_when: "Handling Stripe HTTP responses",
      created_at: "2026-09-14T11:20:00.000Z",
      updated_at: "2026-09-14T11:20:00.000Z",
      body: "Stripe can return HTTP 200 with an error body.",
    });
    const card = parseCard(markdown, "stripe-rate-limit-returns-200");
    expect(card.title).toBe("Stripe rate limit returns 200");
    expect(card.use_when).toContain("Stripe");
    expect(card.body).toContain("HTTP 200");
  });

  test("rejects missing title", () => {
    expect(() =>
      parseCard(`---\nuse_when: x\ncreated_at: a\nupdated_at: b\n---\n\nbody\n`, "x"),
    ).toThrow(/title/);
  });
});
