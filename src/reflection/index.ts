import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CardStore, logsDir } from "../store/index.ts";
import { hostSupportsResume, usableSessionId } from "./complete/host-cli.ts";
import type { Completer } from "./complete/index.ts";
import { createCompleter } from "./complete/index.ts";
import { loadReflectionPrompt } from "./prompt.ts";
import { writeProposedCards } from "./writer.ts";

export type ReflectOptions = {
  transcriptPath: string;
  cwd?: string;
  home?: string;
  host?: "claude" | "cursor" | "codex" | "pi" | "auto";
  sessionId?: string;
  completer?: Completer;
};

export type ReflectResult = {
  written: number;
  skipped: number;
};

/** Short user text for host session resume. Do not attach the transcript. */
export const RESUME_EXTRACT_PROMPT =
  "From this session, return ONLY the JSON card array. No transcript is attached; use the conversation already in context.";

function shouldTryResume(opts: ReflectOptions): boolean {
  if (!usableSessionId(opts.sessionId)) return false;
  if (opts.completer) return true;
  if (process.env.MUTON_MODEL && process.env.MUTON_API_KEY) return false;
  return hostSupportsResume(opts.host ?? "auto");
}

/** Run silent reflection: transcript → model → Cards. Store merges near-duplicates. */
export async function reflect(opts: ReflectOptions): Promise<ReflectResult> {
  const store = new CardStore(opts.home);
  try {
    const system = loadReflectionPrompt({ cwd: opts.cwd, home: store.home });
    let transcript = readFileSync(opts.transcriptPath, "utf8");
    if (transcript.length > 120_000) {
      transcript = transcript.slice(-120_000);
    }
    if (!transcript.trim()) {
      log(store.home, "path=skip wrote=0 skipped=0 empty-transcript");
      return { written: 0, skipped: 0 };
    }

    const complete = opts.completer ?? createCompleter();
    const scratch = join(store.home, "scratch");
    const resumeCwd = opts.cwd ?? scratch;

    if (shouldTryResume(opts)) {
      try {
        const raw = await complete({
          system,
          user: RESUME_EXTRACT_PROMPT,
          host: opts.host,
          cwd: resumeCwd,
          sessionId: opts.sessionId,
        });
        const parsed = extractProposalArray(raw);
        if (parsed) {
          const result = writeProposedCards(store, filterProposals(parsed));
          log(
            store.home,
            `path=resume wrote=${result.written.length} skipped=${result.skipped.length}`,
          );
          return { written: result.written.length, skipped: result.skipped.length };
        }
        log(store.home, "path=resume-fail reason=unparsable");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(store.home, `path=resume-fail reason=${msg.replace(/\s+/g, " ").slice(0, 200)}`);
      }
    } else if (!usableSessionId(opts.sessionId)) {
      log(store.home, "path=fallback reason=no-session-id");
    } else {
      log(store.home, "path=fallback reason=no-resume");
    }

    const raw = await complete({
      system,
      user: transcript,
      host: opts.host,
      cwd: scratch,
    });
    const result = writeProposedCards(store, parseProposals(raw));
    log(
      store.home,
      `path=fallback wrote=${result.written.length} skipped=${result.skipped.length}`,
    );
    return { written: result.written.length, skipped: result.skipped.length };
  } catch (err) {
    log(opts.home ?? store.home, `error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    store.close();
  }
}

export function extractProposalArray(raw: string): unknown[] | null {
  const text = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const jsonText = fence?.[1]?.trim() ?? text;
  const start = jsonText.indexOf("[");
  const end = jsonText.lastIndexOf("]");
  if (start < 0 || end < 0) return null;
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseProposals(
  raw: string,
): Array<{ title: string; use_when: string; body: string }> {
  return filterProposals(extractProposalArray(raw) ?? []);
}

function filterProposals(
  parsed: unknown[],
): Array<{ title: string; use_when: string; body: string }> {
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

export { hostSupportsResume, usableSessionId } from "./complete/host-cli.ts";
export { createCompleter } from "./complete/index.ts";
export { loadReflectionPrompt } from "./prompt.ts";
export { writeProposedCards } from "./writer.ts";
