import { describe, expect, test } from "bun:test";
import {
  buildHostCommand,
  hostSupportsResume,
  usableSessionId,
} from "../../src/reflection/complete/host-cli.ts";

describe("host CLI resume argv", () => {
  test("usableSessionId rejects unknown", () => {
    expect(usableSessionId("unknown")).toBe(false);
    expect(usableSessionId("")).toBe(false);
    expect(usableSessionId("abc")).toBe(true);
  });

  test("pi has no resume", () => {
    expect(hostSupportsResume("pi")).toBe(false);
    expect(() => buildHostCommand("pi", "prompt", "abc")).toThrow(/no session resume/);
  });

  test("claude resume keeps tools and hooks off", () => {
    const { cmd, args } = buildHostCommand("claude", "extract", "sess-1");
    expect(cmd).toBe("claude");
    expect(args).toContain("--resume");
    expect(args).toContain("sess-1");
    expect(args).toContain("--tools");
    expect(args.join(" ")).toContain("disableAllHooks");
    expect(args.at(-1)).toBe("extract");
  });

  test("cursor resume uses --resume chat id", () => {
    const { cmd, args } = buildHostCommand("cursor", "extract", "chat-1");
    expect(cmd).toBe("agent");
    expect(args).toEqual(["-p", "--output-format", "text", "--resume", "chat-1", "extract"]);
  });

  test("codex resume is not ephemeral", () => {
    const resumed = buildHostCommand("codex", "extract", "thread-1");
    expect(resumed.args).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "resume",
      "thread-1",
      "extract",
    ]);
    expect(resumed.args).not.toContain("--ephemeral");
    const fresh = buildHostCommand("codex", "extract");
    expect(fresh.args).toContain("--ephemeral");
  });
});
