import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CardStore } from "../../src/store/index.ts";
import { CardIndex } from "../../src/store/sqlite.ts";

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
    expect(second.use_when).toContain("Stripe HTTP responses");
    expect(second.use_when).toContain("Stripe HTTP 200 bodies");
    expect(second.body).toContain("Read JSON error");
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
    expect(second.title).toBe("Stripe rate limit returns 200");
    expect(store.cardCount()).toBe(1);
  });

  test("equivalent paraphrases do not replace a more detailed Card", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const first = store.upsertDetailed({
      title: "Stripe HTTP 200 errors",
      use_when: "handling Stripe HTTP API responses",
      body: "Inspect the JSON error field even when Stripe returns HTTP status 200; preserve the request id for support.",
    });
    const second = store.upsertDetailed({
      title: "Stripe HTTP 200 errors",
      use_when: "Stripe responses",
      body: "Inspect the JSON error field when Stripe returns 200.",
    });
    expect(first.action).toBe("created");
    expect(second.action).toBe("merged");
    expect(second.card.body).toContain("request id");
    expect(store.cardCount()).toBe(1);
  });

  test("an equivalent proposal is reported as unchanged", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const proposal = {
      title: "Stripe HTTP 200 errors",
      use_when: "handling Stripe responses",
      body: "Inspect the JSON error field even when the status is 200.",
    };
    store.upsertDetailed(proposal);
    expect(store.upsertDetailed(proposal).action).toBe("equivalent");
    expect(store.cardCount()).toBe(1);
  });

  test("related but distinct facts remain separate", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    store.upsert({
      title: "Stripe webhook raw body",
      use_when: "verifying Stripe webhook signatures",
      body: "Pass the unparsed request bytes to signature verification.",
    });
    store.upsert({
      title: "Stripe pagination cursor",
      use_when: "listing Stripe API resources",
      body: "Pass starting_after from the previous page to fetch the next page.",
    });
    expect(store.cardCount()).toBe(2);
  });

  test("update patches named fields and delete removes file plus index", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const card = store.writeNew({
      title: "Patchable Card",
      use_when: "Before patch",
      body: "Original body.",
    });
    const updated = store.update(card.slug, { body: "Corrected body." });
    expect(updated.slug).toBe(card.slug);
    expect(updated.title).toBe("Patchable Card");
    expect(updated.use_when).toBe("Before patch");
    expect(updated.body).toBe("Corrected body.");
    expect(() => store.update(card.slug, {})).toThrow("Update requires at least one field");

    store.delete(card.slug);
    expect(store.read(card.slug)).toBeNull();
    expect(store.cardCount()).toBe(0);
    expect(() => store.delete(card.slug)).toThrow(`Card not found: ${card.slug}`);
  });

  test("update renames the slug when the title changes", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const card = store.writeNew({
      title: "Old Title",
      use_when: "Rename test",
      body: "Body stays.",
    });
    const renamed = store.update(card.slug, { title: "New Title" });
    expect(renamed.slug).toBe("new-title");
    expect(renamed.title).toBe("New Title");
    expect(store.read("old-title")).toBeNull();
    expect(store.read("new-title")?.body).toBe("Body stays.");
    expect(store.cardCount()).toBe(1);
  });

  test("update rejects empty required fields", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const card = store.writeNew({
      title: "Patchable Card",
      use_when: "Before patch",
      body: "Original body.",
    });
    expect(() => store.update(card.slug, { title: "  " })).toThrow(/must not be empty/);
    expect(() => store.update(card.slug, { use_when: "" })).toThrow(/must not be empty/);
    expect(() => store.update(card.slug, { body: "" })).toThrow(/must not be empty/);
    expect(store.read(card.slug)?.body).toBe("Original body.");
  });

  test("delete keeps the file if the index commit fails", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const card = store.writeNew({
      title: "Keep Me",
      use_when: "Commit failure",
      body: "Must survive a failed delete.",
    });
    withFailingCommit(() => {
      expect(() => store.delete(card.slug)).toThrow("commit failed");
    });
    expect(store.read(card.slug)?.body).toBe("Must survive a failed delete.");
    expect(store.cardCount()).toBe(1);
  });

  test("rename keeps the old file if the index commit fails", () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-"));
    store = new CardStore(home);
    const card = store.writeNew({
      title: "Old Title",
      use_when: "Rename failure",
      body: "Must survive a failed rename.",
    });
    withFailingCommit(() => {
      expect(() => store.update(card.slug, { title: "New Title" })).toThrow("commit failed");
    });
    expect(store.read("old-title")?.body).toBe("Must survive a failed rename.");
    expect(store.cardCount()).toBe(1);
  });

  test("concurrent writers keep files and both index tables consistent", async () => {
    home = mkdtempSync(join(tmpdir(), "muton-store-concurrent-"));
    const worker = join(home, "writer.ts");
    const storeModule = pathToFileURL(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../src/store/index.ts"),
    ).href;
    writeFileSync(
      worker,
      `import { CardStore } from ${JSON.stringify(storeModule)};
const [home, id] = process.argv.slice(2);
const store = new CardStore(home);
try {
  store.upsert({
    title: "titleword" + id,
    use_when: "cueword" + id,
    body: "bodyword" + id,
  });
} finally {
  store.close();
}
`,
    );
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => runWriter(worker, home, String(index))),
    );
    await Promise.all(Array.from({ length: 8 }, () => runWriter(worker, home, "same")));

    store = new CardStore(home);
    expect(store.cardCount()).toBe(13);
    expect(readdirSync(join(home, "cards")).filter((name) => name.endsWith(".md"))).toHaveLength(
      13,
    );
    const db = new DatabaseSync(join(home, "index.sqlite"), { readOnly: true });
    try {
      const cards = db.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number };
      const search = db.prepare("SELECT COUNT(*) AS n FROM cards_fts").get() as { n: number };
      const distinct = db.prepare("SELECT COUNT(DISTINCT slug) AS n FROM cards_fts").get() as {
        n: number;
      };
      expect(cards.n).toBe(13);
      expect(search.n).toBe(13);
      expect(distinct.n).toBe(13);
    } finally {
      db.close();
    }
  });
});

function withFailingCommit(fn: () => void): void {
  const original = CardIndex.prototype.commit;
  CardIndex.prototype.commit = function failCommit() {
    throw new Error("commit failed");
  };
  try {
    fn();
  } finally {
    CardIndex.prototype.commit = original;
  }
}

function runWriter(worker: string, home: string, id: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [worker, home, id], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (data) => (stderr += String(data)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`writer ${id} exited ${code}: ${stderr}`));
    });
  });
}
