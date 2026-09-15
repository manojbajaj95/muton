import { DatabaseSync } from "node:sqlite";
import type { Card } from "../cards/index.ts";
import { toFtsQuery } from "../search/bm25.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  use_when TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  slug UNINDEXED,
  title,
  use_when,
  body,
  created_at UNINDEXED,
  updated_at UNINDEXED
);
`;

export type FtsHit = {
  slug: string;
  title: string;
  use_when: string;
  body: string;
  created_at: string;
  updated_at: string;
  bm25: number;
};

export class CardIndex {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  upsert(card: Card): void {
    this.db
      .prepare(
        `INSERT INTO cards (slug, title, use_when, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title=excluded.title,
           use_when=excluded.use_when,
           body=excluded.body,
           updated_at=excluded.updated_at`,
      )
      .run(card.slug, card.title, card.use_when, card.body, card.created_at, card.updated_at);

    this.db.prepare(`DELETE FROM cards_fts WHERE slug = ?`).run(card.slug);
    this.db
      .prepare(
        `INSERT INTO cards_fts (slug, title, use_when, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(card.slug, card.title, card.use_when, card.body, card.created_at, card.updated_at);
  }

  remove(slug: string): void {
    this.db.prepare(`DELETE FROM cards WHERE slug = ?`).run(slug);
    this.db.prepare(`DELETE FROM cards_fts WHERE slug = ?`).run(slug);
  }

  clear(): void {
    this.db.exec(`DELETE FROM cards; DELETE FROM cards_fts;`);
  }

  rebuild(cards: Card[]): void {
    this.clear();
    for (const card of cards) this.upsert(card);
  }

  /** BM25 search; lower bm25 is better in SQLite. */
  search(query: string, limit = 20): FtsHit[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const ftsQuery = toFtsQuery(trimmed);
    if (!ftsQuery) return [];
    const rows = this.db
      .prepare(
        `SELECT slug, title, use_when, body, created_at, updated_at,
                bm25(cards_fts, 0, 10.0, 5.0, 1.0) AS score
         FROM cards_fts
         WHERE cards_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
      slug: string;
      title: string;
      use_when: string;
      body: string;
      created_at: string;
      updated_at: string;
      score: number;
    }>;
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      use_when: r.use_when,
      body: r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      bm25: r.score,
    }));
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM cards`).get() as { n: number };
    return row.n;
  }
}
