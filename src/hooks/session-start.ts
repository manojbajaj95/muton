import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { searchCards } from "../search/index.ts";
import { CardStore, sessionStatePath } from "../store/index.ts";
import type { CanonicalEvent } from "./normalize.ts";

type InjectedState = Record<string, string[]>;

function loadState(home: string): InjectedState {
  try {
    const p = sessionStatePath(home);
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf8")) as InjectedState;
  } catch {
    return {};
  }
}

function saveState(home: string, state: InjectedState): void {
  writeFileSync(sessionStatePath(home), JSON.stringify(state), "utf8");
}

export function buildRepoQuery(cwd?: string): string {
  const parts: string[] = [];
  if (cwd) parts.push(basename(cwd));
  if (cwd) {
    try {
      const remote = execSync("git remote get-url origin", {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      parts.push(remote);
    } catch {
      // no git
    }
  }
  return parts.join(" ") || "project";
}

export type HookOutput = {
  /** Cursor */
  additional_context?: string;
  /** Claude / Codex */
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext: string;
  };
  continue?: boolean;
  suppressOutput?: boolean;
};

export function handleSessionStart(
  event: Extract<CanonicalEvent, { type: "session-start" }>,
  home?: string,
): HookOutput {
  const store = new CardStore(home);
  try {
    const query = buildRepoQuery(event.cwd);
    const { hits, context } = searchCards(store, query, { k: 5 });
    const state = loadState(store.home);
    state[event.sessionId] = hits.map((h) => h.slug);
    saveState(store.home, state);
    if (!context) return { continue: true, suppressOutput: true };
    return contextOutput(context, "SessionStart");
  } finally {
    store.close();
  }
}

export function contextOutput(context: string, hookEventName: string): HookOutput {
  return {
    additional_context: context,
    hookSpecificOutput: {
      hookEventName,
      additionalContext: context,
    },
    continue: true,
    suppressOutput: true,
  };
}
