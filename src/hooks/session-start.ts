import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  const store = new CardStore(home, event.cwd);
  try {
    const state = loadState(store.home);
    state[event.sessionId] = [];
    saveState(store.home, state);
    return { continue: true, suppressOutput: true };
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
