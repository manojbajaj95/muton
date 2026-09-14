import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type CardFrontmatter = {
  title: string;
  use_when: string;
  created_at: string;
  updated_at: string;
};

export type Card = CardFrontmatter & {
  body: string;
  slug: string;
};

type RawFrontmatter = Record<string, unknown>;

function requireString(obj: RawFrontmatter, key: string): string {
  const value = obj[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Card frontmatter missing required string field: ${key}`);
  }
  return value.trim();
}

/** Split markdown into YAML frontmatter and body. */
export function splitFrontmatter(markdown: string): { raw: RawFrontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) {
    throw new Error("Card markdown must start with YAML frontmatter");
  }
  const raw = parseYaml(match[1] ?? "") as RawFrontmatter;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Card frontmatter must be a YAML mapping");
  }
  return { raw, body: (match[2] ?? "").trim() };
}

/** Parse a card markdown file into a Card. */
export function parseCard(markdown: string, slug: string): Card {
  const { raw, body } = splitFrontmatter(markdown);
  if (!body) {
    throw new Error("Card body (durable fact) must not be empty");
  }
  return {
    title: requireString(raw, "title"),
    use_when: requireString(raw, "use_when"),
    created_at: requireString(raw, "created_at"),
    updated_at: requireString(raw, "updated_at"),
    body,
    slug,
  };
}

/** Serialize a Card to markdown with frontmatter. */
export function serializeCard(card: Omit<Card, "slug">): string {
  const frontmatter = stringifyYaml({
    title: card.title,
    use_when: card.use_when,
    created_at: card.created_at,
    updated_at: card.updated_at,
  }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${card.body.trim()}\n`;
}
