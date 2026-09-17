import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installTargets } from "../../src/cli/commands/install.ts";

describe("install command", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("detects initialized hosts when no target is provided", () => {
    const home = mkdtempSync(join(tmpdir(), "muton-install-"));
    roots.push(home);
    mkdirSync(join(home, ".claude"));
    mkdirSync(join(home, ".codex"));

    expect(installTargets([], home)).toEqual(["claude", "codex"]);
  });

  test("keeps an explicit target as an override", () => {
    expect(installTargets(["--target", "pi,cursor,pi"])).toEqual(["pi", "cursor"]);
  });

  test("explains how to install when no host can be detected", () => {
    const home = mkdtempSync(join(tmpdir(), "muton-install-empty-"));
    roots.push(home);

    expect(() => installTargets([], home)).toThrow("Use --target cursor,claude,codex,pi");
  });
});
