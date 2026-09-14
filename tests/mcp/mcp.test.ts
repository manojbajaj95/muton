import { describe, expect, test } from "bun:test";

describe("mcp", () => {
  test("module loads", async () => {
    const mod = await import("../../src/mcp/index.ts");
    expect(typeof mod.startMcpServer).toBe("function");
  });
});
