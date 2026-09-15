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

/** Last path segment of a git remote, without .git. */
export function repoNameFromRemote(remote: string): string {
  return (
    remote
      .trim()
      .replace(/\.git$/i, "")
      .split(/[/:]/)
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

export function buildRepoQuery(cwd?: string): string {
  if (!cwd) return "";
  const names = new Set<string>([basename(cwd)]);
  try {
    const remote = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const repo = repoNameFromRemote(remote);
    if (repo) names.add(repo);
  } catch {
    // no git
  }
  return [...names].join(" ");
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
