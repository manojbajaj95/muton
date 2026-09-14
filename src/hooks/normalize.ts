export type CanonicalEvent =
  | {
      type: "session-start";
      sessionId: string;
      cwd?: string;
      workspaceRoots?: string[];
      raw: Record<string, unknown>;
    }
  | {
      type: "prompt-submit";
      sessionId: string;
      prompt: string;
      cwd?: string;
      raw: Record<string, unknown>;
    }
  | {
      type: "session-end";
      sessionId: string;
      transcriptPath?: string | null;
      cwd?: string;
      host?: "claude" | "cursor" | "codex" | "pi";
      raw: Record<string, unknown>;
    }
  | { type: "unknown"; raw: Record<string, unknown> };

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Normalize host hook JSON into a canonical event. */
export function normalizeHookInput(
  eventName: string,
  rawInput: unknown,
  hostHint?: "claude" | "cursor" | "codex" | "pi",
): CanonicalEvent {
  const raw = asRecord(rawInput);
  const name = (str(raw.hook_event_name) ?? eventName).toLowerCase();
  const sessionId =
    str(raw.session_id) ?? str(raw.conversation_id) ?? str(raw.sessionId) ?? "unknown";
  const cwd =
    str(raw.cwd) ??
    (Array.isArray(raw.workspace_roots) ? str(raw.workspace_roots[0]) : undefined) ??
    process.env.CURSOR_PROJECT_DIR ??
    process.env.CLAUDE_PROJECT_DIR ??
    process.cwd();
  const transcriptPath =
    str(raw.transcript_path) ??
    str(raw.transcriptPath) ??
    process.env.CURSOR_TRANSCRIPT_PATH ??
    null;

  if (
    name === "sessionstart" ||
    name === "session_start" ||
    name === "session-start" ||
    eventName === "session-start"
  ) {
    return {
      type: "session-start",
      sessionId,
      cwd,
      workspaceRoots: Array.isArray(raw.workspace_roots)
        ? raw.workspace_roots.filter((x): x is string => typeof x === "string")
        : undefined,
      raw,
    };
  }

  if (
    name === "beforesubmitprompt" ||
    name === "userpromptsubmit" ||
    name === "prompt-submit" ||
    eventName === "prompt-submit"
  ) {
    const prompt =
      str(raw.prompt) ?? str(raw.user_prompt) ?? str(raw.message) ?? str(raw.content) ?? "";
    return { type: "prompt-submit", sessionId, prompt, cwd, raw };
  }

  if (
    name === "sessionend" ||
    name === "session_end" ||
    name === "session_shutdown" ||
    name === "session-end" ||
    eventName === "session-end"
  ) {
    return {
      type: "session-end",
      sessionId,
      transcriptPath,
      cwd,
      host: hostHint,
      raw,
    };
  }

  return { type: "unknown", raw };
}
