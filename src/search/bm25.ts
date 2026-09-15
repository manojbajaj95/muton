/** Function words and prompt filler that drown distinctive terms. */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "at",
  "by",
  "for",
  "with",
  "from",
  "into",
  "to",
  "of",
  "in",
  "on",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "my",
  "your",
  "our",
  "can",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "please",
  "how",
  "what",
  "which",
  "who",
  "why",
  "where",
  "not",
  "no",
  "so",
  "just",
  "also",
  "than",
  "too",
  "very",
  "http",
  "https",
  "www",
]);

const MAX_TOKENS = 12;

/** Unique non-stopword tokens, in first-seen order. */
export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ");
  for (const raw of cleaned.split(/\s+/)) {
    const t = raw.trim();
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
    if (tokens.length >= MAX_TOKENS) break;
  }
  return tokens;
}

/** Turn free text into a safe FTS5 OR query of tokens. */
export function toFtsQuery(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return "";
  // ponytail: OR keeps merge-candidate recall; searchCards drops weak hits
  return tokens.map((t) => `"${t.replaceAll('"', "")}"`).join(" OR ");
}
