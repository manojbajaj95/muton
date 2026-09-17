import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mutonHome } from "../../src/store/fs.ts";

describe("project-local paths", () => {
  const previousHome = process.env.MUTON_HOME;
  let root = "";

  afterEach(() => {
    if (previousHome === undefined) delete process.env.MUTON_HOME;
    else process.env.MUTON_HOME = previousHome;
    if (root) rmSync(root, { recursive: true, force: true });
  });

  test("places Cards at the git project root when invoked from a subdirectory", () => {
    delete process.env.MUTON_HOME;
    root = mkdtempSync(join(tmpdir(), "muton-project-path-"));
    const nested = join(root, "src", "nested");
    mkdirSync(nested, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    expect(mutonHome(undefined, nested)).toBe(join(realpathSync(root), ".agents", "muton"));
  });
});
