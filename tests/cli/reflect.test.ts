import { describe, expect, test } from "bun:test";
import { cmdReflect } from "../../src/cli/commands/reflect.ts";

describe("reflect command", () => {
  test("directs users from host to backend", async () => {
    await expect(cmdReflect(["--host", "claude"])).rejects.toThrow(
      "--host is only used by hooks; use --backend for reflection",
    );
  });
});
