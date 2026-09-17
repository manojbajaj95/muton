import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatHookOutput } from "../../src/cli/commands/hook.ts";
import { normalizeHookInput, runHook } from "../../src/hooks/index.ts";
import { contextOutput } from "../../src/hooks/session-start.ts";
import { CardStore, sessionStatePath } from "../../src/store/index.ts";

describe("hooks", () => {
  let home = "";

  afterEach(() => {
    if (home) rmSync(home, { recursive: true, force: true });
    delete process.env.MUTON_REFLECTION_PROCESS;
  });

  test("normalizes session and project context", () => {
    const event = normalizeHookInput("session-start", {
      hook_event_name: "sessionStart",
      session_id: "s1",
      workspace_roots: ["/tmp/proj"],
    });
    expect(event.type).toBe("session-start");
    if (event.type === "session-start") expect(event.cwd).toBe("/tmp/proj");
  });

  test("session-start initializes state without injecting Cards", () => {
    home = mkdtempSync(join(tmpdir(), "muton-hook-"));
    const store = new CardStore(home);
    store.writeNew({
      title: "muton-hook encoding",
      use_when: "working in muton-hook projects",
      body: "Use UTF-8 for muton-hook fixtures.",
    });
    store.close();
    const out = runHook(
      "session-start",
      { session_id: "abc", workspace_roots: [join(home, "muton-hook-workspace")] },
      { home },
    );
    expect(out).toEqual({ continue: true, suppressOutput: true });
    expect(JSON.parse(readFileSync(sessionStatePath(home), "utf8"))).toEqual({ abc: [] });
  });

  test("formats additional context for each host schema", () => {
    const output = contextOutput("CARD", "UserPromptSubmit");

    expect(formatHookOutput(output, "codex")).toEqual({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "CARD" },
      continue: true,
      suppressOutput: true,
    });
    expect(formatHookOutput(output, "cursor")).toEqual({
      additional_context: "CARD",
      continue: true,
      suppressOutput: true,
    });
  });

  test("reflection subprocess marker disables every hook", () => {
    home = mkdtempSync(join(tmpdir(), "muton-hook-marker-"));
    process.env.MUTON_REFLECTION_PROCESS = "1";
    const out = runHook(
      "session-end",
      { session_id: "abc", transcript_path: join(home, "missing") },
      { host: "pi", home },
    );
    expect(out).toEqual({ continue: true, suppressOutput: true });
  });
});
