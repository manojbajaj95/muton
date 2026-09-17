import { RETRIEVAL_TUNING } from "./tuning.ts";

/** Unique normalized query tokens, in first-seen order. */
export function tokenize(text: string, limit: number = RETRIEVAL_TUNING.query.maxTokens): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ");
  for (const raw of cleaned.split(/\s+/)) {
    const word = raw.trim();
    if (word.length < 2 || RETRIEVAL_TUNING.query.ignoredTerms.has(word)) continue;
    const token = stem(RETRIEVAL_TUNING.query.aliases.get(word) ?? word);
    if (token.length < 2 || RETRIEVAL_TUNING.query.ignoredTerms.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= limit) break;
  }
  return tokens;
}

/** Turn free text into a safe FTS5 OR query of normalized token prefixes. */
export function toFtsQuery(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return "";
  return tokens.map((token) => `"${token.replaceAll('"', "")}"*`).join(" OR ");
}

function stem(token: string): string {
  if (token.length > 6 && token.endsWith("tion")) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}
