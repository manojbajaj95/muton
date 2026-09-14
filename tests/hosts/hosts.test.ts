import { describe, expect, test } from "bun:test";
import { parseTargets } from "../../src/hosts/index.ts";

describe("hosts", () => {
  test("parseTargets", () => {
    expect(parseTargets("cursor,claude")).toEqual(["cursor", "claude"]);
    expect(() => parseTargets("foo")).toThrow();
  });
});
