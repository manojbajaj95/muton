/** Turn free text into a safe FTS5 OR query of tokens. */
export function toFtsQuery(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t.replaceAll('"', "")}"`).join(" OR ");
}
