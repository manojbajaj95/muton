import { describe, expect, test } from "bun:test";
import { buildHostCommand } from "../../src/reflection/complete/host-cli.ts";

describe("isolated host CLI argv", () => {
  test("Pi disables session state, extensions, context, and tools", () => {
    const command = buildHostCommand("pi", "extract", "model-1");
    expect(command.cmd).toBe("pi");
    expect(command.args).toContain("--no-session");
    expect(command.args).toContain("--no-extensions");
    expect(command.args).toContain("--no-context-files");
    expect(command.args).toContain("--no-tools");
    expect(command.args).not.toContain("--resume");
  });

  test("Claude disables tools, hooks, and session persistence", () => {
    const { args } = buildHostCommand("claude", "extract");
    expect(args).toContain("--tools");
    expect(args).toContain("--no-session-persistence");
    expect(args.join(" ")).toContain("disableAllHooks");
    expect(args).not.toContain("--resume");
  });

  test("Codex is ephemeral with hooks and project rules disabled", () => {
    const { args } = buildHostCommand("codex", "extract");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("hooks");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--ignore-rules");
    expect(args).not.toContain("resume");
  });

  test("Cursor uses ask mode and its sandbox", () => {
    const { cmd, args } = buildHostCommand("cursor", "extract");
    expect(cmd).toBe("agent");
    expect(args).toContain("ask");
    expect(args).toContain("enabled");
    expect(args).not.toContain("--resume");
  });
});
