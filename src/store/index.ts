import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Card, parseCard, serializeCard, slugify } from "../cards/index.ts";
import { cardsDir, indexPath, logsDir, mutonHome, scratchDir, tmpDir } from "./fs.ts";
import { CardIndex } from "./sqlite.ts";

export type ProposeInput = {
  title: string;
  use_when: string;
  body: string;
};

export class CardStore {
  readonly home: string;
  private index: CardIndex | null = null;

  constructor(home = mutonHome()) {
    this.home = home;
    this.ensureDirs();
  }

  ensureDirs(): void {
    for (const dir of [
      cardsDir(this.home),
      tmpDir(this.home),
      scratchDir(this.home),
      logsDir(this.home),
    ]) {
      mkdirSync(dir, { recursive: true });
    }
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

  /** Allocate a unique slug from title. */
  allocateSlug(title: string): string {
    const base = slugify(title);
    let slug = base;
    let n = 2;
    while (this.read(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    return slug;
  }

  writeNew(input: ProposeInput, now = new Date()): Card {
    const iso = now.toISOString();
    const slug = this.allocateSlug(input.title);
    const card: Card = {
      slug,
      title: input.title.trim(),
      use_when: input.use_when.trim(),
      body: input.body.trim(),
      created_at: iso,
      updated_at: iso,
    };
    const path = join(cardsDir(this.home), `${slug}.md`);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, serializeCard(card), "utf8");
    renameSync(tmp, path);
    this.getIndex().upsert(card);
    return card;
  }

  searchRaw(query: string, limit = 20) {
    return this.getIndex().search(query, limit);
  }

  cardCount(): number {
    return this.getIndex().count();
  }

  rebuildIndex(): void {
    this.getIndex().rebuild(this.listCards());
  }
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
