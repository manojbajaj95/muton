import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { searchCards } from "../search/index.ts";
import { CardStore, sessionStatePath } from "../store/index.ts";
import type { CanonicalEvent } from "./normalize.ts";
import { contextOutput, type HookOutput } from "./session-start.ts";

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

export function handlePromptSubmit(
  event: Extract<CanonicalEvent, { type: "prompt-submit" }>,
  home?: string,
): HookOutput {
  const store = new CardStore(home);
  try {
    if (!event.prompt.trim()) return { continue: true, suppressOutput: true };
    const state = loadState(store.home);
    const exclude = new Set(state[event.sessionId] ?? []);
    const { hits, context } = searchCards(store, event.prompt, {
      k: 5,
      excludeSlugs: exclude,
    });
    state[event.sessionId] = [...exclude, ...hits.map((h) => h.slug)];
    saveState(store.home, state);
    if (!context) return { continue: true, suppressOutput: true };
    return contextOutput(context, "UserPromptSubmit");
  } finally {
    store.close();
  }
}
