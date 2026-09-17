import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  autoUpdateNeeded,
  globalUpdateCommand,
  isLocalCheckout,
  VERSION,
} from "../../src/cli/commands/update.ts";

describe("update command", () => {
  test("updates only once per installed version", () => {
    expect(autoUpdateNeeded(undefined, false)).toBe(true);
    expect(autoUpdateNeeded(VERSION, false)).toBe(false);
    expect(autoUpdateNeeded(undefined, true)).toBe(false);
  });

  test("uses the package manager that installed Muton", () => {
    expect(
      globalUpdateCommand("/home/me/.bun/install/global/node_modules/mutoncli/dist/cli.js"),
    ).toEqual(["bun", ["add", "-g", "mutoncli@latest"]]);
    expect(globalUpdateCommand("/home/me/.bun/bin/muton")).toEqual([
      "bun",
      ["add", "-g", "mutoncli@latest"],
    ]);
    expect(globalUpdateCommand("/usr/local/lib/node_modules/mutoncli/dist/cli.js")).toEqual([
      "npm",
      ["install", "-g", "mutoncli@latest"],
    ]);
  });

  test("recognizes this repository build as local", () => {
    expect(isLocalCheckout(join(process.cwd(), "dist", "cli.js"))).toBe(true);
  });
});
