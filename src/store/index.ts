import { randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Card, type CardSource, parseCard, serializeCard, slugify } from "../cards/index.ts";
import { cardsDir, indexPath, mutonHome } from "./fs.ts";
import { CardIndex, type FtsHit } from "./sqlite.ts";

const MERGE_SEARCH_K = 20;
const TITLE_OVERLAP = 0.55;
const CONTENT_OVERLAP = 0.72;
const FTS_QUERY_MAX = 500;
const LOCK_TIMEOUT_MS = 5_000;

export type ProposeInput = {
  title: string;
  use_when: string;
  body: string;
  sources?: CardSource[];
};

export type UpdateInput = {
  title?: string;
  use_when?: string;
  body?: string;
  sources?: CardSource[];
};

export type UpsertResult = { card: Card; action: "created" | "equivalent" | "merged" };

export class CardStore {
  readonly home: string;
  private index: CardIndex | null = null;

  constructor(home?: string, cwd?: string) {
    this.home = mutonHome(home, cwd);
    this.ensureDirs();
  }

  ensureDirs(): void {
    mkdirSync(cardsDir(this.home), { recursive: true });
  }

  private getIndex(): CardIndex {
    if (!this.index) {
      this.index = new CardIndex(indexPath(this.home));
      if (this.index.count() === 0) {
        const cards = this.listCards();
        if (cards.length > 0) this.index.rebuild(cards);
      }
    }
    return this.index;
  }

  close(): void {
    this.index?.close();
    this.index = null;
  }

  listCards(): Card[] {
    const dir = cardsDir(this.home);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      return [];
    }
    const cards: Card[] = [];
    for (const file of files) {
      const slug = file.replace(/\.md$/, "");
      try {
        const markdown = readFileSync(join(dir, file), "utf8");
        cards.push(parseCard(markdown, slug));
      } catch {
        // skip corrupt cards
      }
    }
    return cards;
  }

  read(slug: string): Card | null {
    try {
      const markdown = readFileSync(join(cardsDir(this.home), `${slug}.md`), "utf8");
      return parseCard(markdown, slug);
    } catch {
      return null;
    }
  }

  /** Allocate a unique slug from title. `except` keeps the current card's slug available when renaming. */
  allocateSlug(title: string, except?: string): string {
    const base = slugify(title);
    let slug = base;
    let n = 2;
    while (true) {
      const hit = this.read(slug);
      if (!hit || hit.slug === except) return slug;
      slug = `${base}-${n}`;
      n += 1;
    }
  }

  /**
   * Write a card. Near-duplicate title/use_when/body updates the existing slug.
   * ponytail: FTS + token overlap; add embeddings only if the hive still grows.
   */
  upsert(input: ProposeInput, now = new Date()): Card {
    return this.upsertDetailed(input, now).card;
  }

  upsertDetailed(input: ProposeInput, now = new Date()): UpsertResult {
    return this.withWriteLock(() => {
      const normalized = normalizeInput(input);
      const match = this.findMergeMatch(normalized);
      if (!match) return { card: this.writeNewUnlocked(normalized, now), action: "created" };

      const merged = mergeCard(match, normalized, now);
      if (!merged) return { card: match, action: "equivalent" };
      return { card: this.persist(merged), action: "merged" };
    });
  }

  update(slug: string, input: UpdateInput, now = new Date()): Card {
    return this.withWriteLock(() => {
      const existing = this.read(slug);
      if (!existing) throw new Error(`Card not found: ${slug}`);
      if (
        input.title === undefined &&
        input.use_when === undefined &&
        input.body === undefined &&
        input.sources === undefined
      ) {
        throw new Error("Update requires at least one field");
      }
      const next: ProposeInput = {
        title: input.title ?? existing.title,
        use_when: input.use_when ?? existing.use_when,
        body: input.body ?? existing.body,
        sources: input.sources,
      };
      const normalized = normalizeInput(next);
      const nextSlug = input.title !== undefined ? this.allocateSlug(normalized.title, slug) : slug;
      return this.persist(
        {
          ...existing,
          slug: nextSlug,
          title: normalized.title,
          use_when: normalized.use_when,
          body: normalized.body,
          sources: input.sources ? normalized.sources : existing.sources,
          updated_at: now.toISOString(),
        },
        slug,
      );
    });
  }

  delete(slug: string): void {
    this.withWriteLock(() => {
      const path = join(cardsDir(this.home), `${slug}.md`);
      if (!this.read(slug)) throw new Error(`Card not found: ${slug}`);
      const index = this.getIndex();
      index.beginWrite();
      try {
        index.remove(slug);
        index.commit();
      } catch (error) {
        try {
          index.rollback();
        } catch {
          // The transaction may already be closed.
        }
        throw error;
      }
      rmSync(path, { force: true });
    });
  }

  writeNew(input: ProposeInput, now = new Date()): Card {
    return this.withWriteLock(() => this.writeNewUnlocked(normalizeInput(input), now));
  }

  private writeNewUnlocked(input: ProposeInput, now: Date): Card {
    const iso = now.toISOString();
    const slug = this.allocateSlug(input.title);
    return this.persist({
      slug,
      title: input.title.trim(),
      use_when: input.use_when.trim(),
      body: input.body.trim(),
      created_at: iso,
      updated_at: iso,
      sources: input.sources,
    });
  }

  private findMergeMatch(input: ProposeInput): Card | undefined {
    const query = [input.title, input.use_when, input.body]
      .join(" ")
      .trim()
      .slice(0, FTS_QUERY_MAX);
    if (!query) return undefined;
    const hits = this.searchRaw(query, MERGE_SEARCH_K);
    if (hits.length === 0) return undefined;

    const lower = input.title.toLowerCase();
    const exact = hits.find((hit) => hit.title.toLowerCase() === lower);
    if (exact) return this.read(exact.slug) ?? undefined;

    let best: FtsHit | undefined;
    let bestScore = 0;
    for (const hit of hits) {
      const titleScore = tokenOverlap(hit.title, input.title);
      const contentScore = tokenOverlap(hit.body, input.body);
      const merge =
        equivalentText(hit.body, input.body) ||
        (titleScore >= TITLE_OVERLAP && contentScore >= CONTENT_OVERLAP);
      if (!merge) continue;
      if (!best || contentScore > bestScore) {
        best = hit;
        bestScore = contentScore;
      }
    }
    return best ? (this.read(best.slug) ?? undefined) : undefined;
  }

  private persist(card: Card, previousSlug?: string): Card {
    const dir = cardsDir(this.home);
    const path = join(dir, `${card.slug}.md`);
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(tmp, serializeCard(card), { encoding: "utf8", mode: 0o600 });
    const index = this.getIndex();
    index.beginWrite();
    try {
      if (previousSlug && previousSlug !== card.slug) index.remove(previousSlug);
      index.upsert(card);
      renameSync(tmp, path);
      index.commit();
    } catch (error) {
      try {
        index.rollback();
      } catch {
        // The transaction may already be closed.
      }
      rmSync(tmp, { force: true });
      throw error;
    }
    if (previousSlug && previousSlug !== card.slug) {
      rmSync(join(dir, `${previousSlug}.md`), { force: true });
    }
    return card;
  }

  private withWriteLock<T>(fn: () => T): T {
    const lock = join(this.home, ".write.lock");
    const started = Date.now();
    let fd: number | undefined;
    while (fd === undefined) {
      try {
        fd = openSync(lock, "wx", 0o600);
        writeFileSync(fd, String(process.pid));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          if (Date.now() - statSync(lock).mtimeMs > 300_000) rmSync(lock, { force: true });
        } catch {
          // Another writer may have just released the lock.
        }
        if (Date.now() - started >= LOCK_TIMEOUT_MS)
          throw new Error("Timed out waiting for Card store write lock");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    try {
      return fn();
    } finally {
      closeSync(fd);
      rmSync(lock, { force: true });
    }
  }

  searchRaw(query: string, limit = 20) {
    return this.getIndex().search(query, limit);
  }

  cardCount(): number {
    return this.getIndex().count();
  }

  rebuildIndex(): void {
    this.withWriteLock(() => this.getIndex().rebuild(this.listCards()));
  }
}

function normalizeInput(input: ProposeInput): ProposeInput {
  const title = input.title.trim();
  const use_when = input.use_when.trim();
  const body = input.body.trim();
  if (!title || !use_when || !body) {
    throw new Error("Card title, use_when, and body must not be empty");
  }
  return {
    title,
    use_when,
    body,
    sources: mergeSources([], input.sources ?? []),
  };
}

function mergeCard(existing: Card, input: ProposeInput, now: Date): Card | undefined {
  const body = mergeText(existing.body, input.body, "\n\n");
  const useWhen = mergeText(existing.use_when, input.use_when, "; ");
  const sources = mergeSources(existing.sources ?? [], input.sources ?? []);
  const unchanged =
    body === existing.body &&
    useWhen === existing.use_when &&
    sources.length === (existing.sources?.length ?? 0);
  if (unchanged) return undefined;
  return {
    ...existing,
    body,
    use_when: useWhen,
    sources: sources.length ? sources : undefined,
    updated_at: now.toISOString(),
  };
}

function mergeText(existing: string, incoming: string, separator: string): string {
  if (equivalentText(existing, incoming) || normalized(existing).includes(normalized(incoming))) {
    return existing;
  }
  if (normalized(incoming).includes(normalized(existing))) return incoming;
  return `${existing}${separator}${incoming}`;
}

function equivalentText(a: string, b: string): boolean {
  return normalized(a) === normalized(b) || tokenOverlap(a, b) >= 0.9;
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeSources(a: CardSource[], b: CardSource[]): CardSource[] {
  const values = new Map<string, CardSource>();
  for (const source of [...a, ...b]) {
    values.set(`${source.session_id}\0${source.transcript_hash}`, source);
  }
  return [...values.values()];
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

export {
  cardsDir,
  indexPath,
  logsDir,
  mutonHome,
  scratchDir,
  sessionStatePath,
  tmpDir,
} from "./fs.ts";
