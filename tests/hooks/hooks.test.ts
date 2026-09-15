import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeHookInput, resolveReflectArgs, runHook } from "../../src/hooks/index.ts";
import { repoNameFromRemote } from "../../src/hooks/session-start.ts";
import { CardStore } from "../../src/store/index.ts";

describe("hooks", () => {
  let home: string;

  afterEach(() => {
    if (home) rmSync(home, { recursive: true, force: true });
  });

  test("normalize session-start", () => {
    const e = normalizeHookInput("session-start", {
      hook_event_name: "sessionStart",
      session_id: "s1",
      workspace_roots: ["/tmp/proj"],
    });
    expect(e.type).toBe("session-start");
  });

  test("session-start injects context", () => {
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
    expect(out.additional_context || out.hookSpecificOutput?.additionalContext).toBeTruthy();
  });

  test("session-end returns silent empty object path", () => {
    home = mkdtempSync(join(tmpdir(), "muton-hook-end-"));
    const transcript = join(home, "t.jsonl");
    writeFileSync(transcript, "hello");
    const out = runHook(
      "session-end",
      { session_id: "abc", transcript_path: transcript },
      { home },
    );
    expect(out.suppressOutput).toBe(true);
  });

  test("session-end reflect args include session id", () => {
    const args = resolveReflectArgs("/tmp/t.txt", "/proj", "claude", "sess-9");
    expect(args).toContain("--session-id");
    expect(args).toContain("sess-9");
    expect(args).toContain("--host");
    expect(args).toContain("claude");
  });

  test("session-end omits unknown session id", () => {
    const args = resolveReflectArgs("/tmp/t.txt", undefined, undefined, "unknown");
    expect(args).not.toContain("--session-id");
  });

  test("repoNameFromRemote uses the last path segment", () => {
    expect(repoNameFromRemote("https://github.com/acme/muton.git")).toBe("muton");
    expect(repoNameFromRemote("git@github.com:acme/muton.git")).toBe("muton");
  });
});
