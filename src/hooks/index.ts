import { normalizeHookInput } from "./normalize.ts";
import { handlePromptSubmit } from "./prompt-submit.ts";
import { handleSessionEnd } from "./session-end.ts";
import { type HookOutput, handleSessionStart } from "./session-start.ts";

export type HookEventName = "session-start" | "prompt-submit" | "session-end";

/** Dispatch a hook event from stdin JSON; returns silent-friendly output. */
export function runHook(
  eventName: HookEventName,
  raw: unknown,
  opts?: {
    home?: string;
    runtimeHome?: string;
    host?: "claude" | "cursor" | "codex" | "pi";
  },
): HookOutput {
  if (process.env.MUTON_REFLECTION_PROCESS === "1") {
    return { continue: true, suppressOutput: true };
  }
  const event = normalizeHookInput(eventName, raw, opts?.host);
  switch (event.type) {
    case "session-start":
      return handleSessionStart(event, opts?.home);
    case "prompt-submit":
      return handlePromptSubmit(event, opts?.home, opts?.runtimeHome);
    case "session-end":
      return handleSessionEnd(event, opts?.home, opts?.runtimeHome);
    default:
      return { continue: true, suppressOutput: true };
  }
}

export { normalizeHookInput } from "./normalize.ts";
export type { HookOutput } from "./session-start.ts";
