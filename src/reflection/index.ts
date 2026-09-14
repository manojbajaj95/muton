import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CardStore, logsDir } from "../store/index.ts";
import type { Completer } from "./complete/index.ts";
import { createCompleter } from "./complete/index.ts";
import { loadReflectionPrompt } from "./prompt.ts";
import { writeProposedCards } from "./writer.ts";

export type ReflectOptions = {
  transcriptPath: string;
  cwd?: string;
  home?: string;
  host?: "claude" | "cursor" | "codex" | "pi" | "auto";
  completer?: Completer;
};

export type ReflectResult = {
  written: number;
  skipped: number;
};

/** Run silent reflection: transcript → model → new Cards. */
export async function reflect(opts: ReflectOptions): Promise<ReflectResult> {
  const store = new CardStore(opts.home);
  try {
    const system = loadReflectionPrompt({ cwd: opts.cwd, home: store.home });
    let transcript = readFileSync(opts.transcriptPath, "utf8");
    // Cap transcript size for the model call
    if (transcript.length > 120_000) {
      transcript = transcript.slice(-120_000);
    }
    const existing = store
      .listCards()
      .slice(0, 40)
      .map((c) => `- ${c.title}`)
      .join("\n");
    const user = [
      "Existing card titles (do not duplicate):",
      existing || "(none)",
      "",
      "Session transcript:",
      transcript,
    ].join("\n");

    const complete = opts.completer ?? createCompleter();
    const raw = await complete({
      system,
      user,
      host: opts.host,
      cwd: join(store.home, "scratch"),
    });
    const proposals = parseProposals(raw);
    const result = writeProposedCards(store, proposals);
    log(store.home, `wrote=${result.written.length} skipped=${result.skipped.length}`);
    return { written: result.written.length, skipped: result.skipped.length };
  } catch (err) {
    log(opts.home ?? store.home, `error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    store.close();
  }
}

export function parseProposals(
  raw: string,
): Array<{ title: string; use_when: string; body: string }> {
  const text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonText = fence?.[1]?.trim() ?? text;
  // Find array bounds
  const start = jsonText.indexOf("[");
  const end = jsonText.lastIndexOf("]");
  if (start < 0 || end < 0) return [];
  const parsed = JSON.parse(jsonText.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (p): p is { title: string; use_when: string; body: string } =>
      !!p &&
      typeof p === "object" &&
      typeof (p as { title: unknown }).title === "string" &&
      typeof (p as { use_when: unknown }).use_when === "string" &&
      typeof (p as { body: unknown }).body === "string",
  );
}

function log(home: string, line: string): void {
  try {
    appendFileSync(join(logsDir(home), "reflect.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore log failures
  }
}

export { createCompleter } from "./complete/index.ts";
export { loadReflectionPrompt } from "./prompt.ts";
export { writeProposedCards } from "./writer.ts";
