import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeHookInput, runHook } from "../../src/hooks/index.ts";
import { repoNameFromRemote } from "../../src/hooks/session-start.ts";
import { CardStore } from "../../src/store/index.ts";

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

  test("session-start injects project-local context", () => {
    home = mkdtempSync(join(tmpdir(), "muton-hook-"));
    const runtimeHome = join(home, "global-runtime");
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
      { home, runtimeHome },
    );
    expect(out.additional_context || out.hookSpecificOutput?.additionalContext).toBeTruthy();
    const log = readFileSync(join(runtimeHome, "runtime", "logs", "reflection.jsonl"), "utf8");
    expect(log).toContain('"card_ids":["muton-hook-encoding"]');
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

  test("repoNameFromRemote uses the last path segment", () => {
    expect(repoNameFromRemote("https://github.com/acme/muton.git")).toBe("muton");
    expect(repoNameFromRemote("git@github.com:acme/muton.git")).toBe("muton");
  });
});
