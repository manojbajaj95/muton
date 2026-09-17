import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mutonHome, runtimeHome } from "../store/fs.ts";

/** Built-in reflection prompt. Always used as the base; extra REFLECTION.md is appended. */
export const DEFAULT_REFLECTION_PROMPT = `You extract 0–5 durable knowledge cards from a sanitized session transcript for Muton.

Each input record has a stable evidence id and contains only semantic text or tool observations.

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "title": "short distinctive name (also becomes the card filename)",
  "use_when": "situation, entity, or cue when this card applies",
  "body": "the durable fact — concrete and reusable",
  "evidence": ["r2"]
}

Rules:
- Propose only durable facts that would help another agent later.
- Prefer concrete state: APIs, encodings, workarounds, environment facts, non-obvious constraints.
- Treat user and system instructions as supplied context, not discoveries. A transcript containing only instructions must return [].
- Every proposal must cite existing record ids and include at least one assistant or tool record that supports the fact.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, repeated task instructions, and ephemeral debugging chatter.
- The store merges near-duplicates. Do not list or reuse existing hive titles. Do NOT delete cards. Do NOT invent facts not supported by the transcript.
- Prefer fewer high-value cards (0–5). Return [] if nothing durable was learned.
- title, use_when, body, and evidence are mandatory. Unknown fields are invalid.`;

/**
 * Default prompt, plus the first extra REFLECTION.md found (project, then home).
 */
export function loadReflectionPrompt(opts?: {
  cwd?: string;
  home?: string;
  runtimeHome?: string;
}): string {
  const cwd = opts?.cwd ?? process.cwd();
  const home = opts?.home ?? mutonHome();
  const extra = readExtraPrompt(cwd, home, opts?.runtimeHome ?? runtimeHome());
  if (!extra) return DEFAULT_REFLECTION_PROMPT;
  return `${DEFAULT_REFLECTION_PROMPT}\n\n${extra}`;
}

function readExtraPrompt(cwd: string, home: string, globalHome: string): string {
  for (const path of [
    join(cwd, "REFLECTION.md"),
    join(home, "REFLECTION.md"),
    join(globalHome, "REFLECTION.md"),
  ]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").trim();
    if (text) return text;
  }
  return "";
}
