import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mutonHome } from "../store/fs.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Fallback when package prompts/ are not on disk (bundled binary). */
export const DEFAULT_REFLECTION_PROMPT = `You extract NEW durable knowledge cards from an agent session transcript for a shared hive memory (Muton).

Return ONLY a JSON array. No markdown fences. No commentary. Each item:
{
  "title": "short distinctive name (also becomes the card filename)",
  "use_when": "situation, entity, or cue when this card applies",
  "body": "the durable fact — concrete and reusable"
}

Rules:
- Propose only NEW durable facts that would help another agent later.
- Prefer concrete state: APIs, encodings, workarounds, environment facts, non-obvious constraints.
- Skip: one-off plans, full transcripts, secrets/credentials, generic advice, schema reminders the task already states, ephemeral debugging chatter.
- Do NOT rewrite or delete existing cards. Do NOT invent facts not supported by the transcript.
- Prefer fewer high-value cards (0–5). Return [] if nothing durable was learned.
- title and use_when are mandatory and non-empty. body is the durable fact.`;

/** Bundled default prompt path (package prompts/REFLECTION.md). */
export function bundledReflectionPath(): string | null {
  const candidates = [
    join(HERE, "..", "prompts", "REFLECTION.md"),
    join(HERE, "..", "..", "prompts", "REFLECTION.md"),
    join(HERE, "..", "..", "..", "prompts", "REFLECTION.md"),
    join(process.cwd(), "prompts", "REFLECTION.md"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Resolve reflection prompt: project REFLECTION.md → ~/.agents/muton/REFLECTION.md → bundled file → default string.
 */
export function loadReflectionPrompt(opts?: { cwd?: string; home?: string }): string {
  const cwd = opts?.cwd ?? process.cwd();
  const home = opts?.home ?? mutonHome();
  const bundled = bundledReflectionPath();
  const paths = [
    join(cwd, "REFLECTION.md"),
    join(home, "REFLECTION.md"),
    ...(bundled ? [bundled] : []),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return readFileSync(p, "utf8").trim();
    }
  }
  return DEFAULT_REFLECTION_PROMPT;
}
