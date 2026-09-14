import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReflectionPrompt, parseProposals, reflect } from "../../src/reflection/index.ts";

describe("reflection prompt", () => {
  test("prefers project REFLECTION.md", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-prompt-"));
    const home = join(root, "home");
    const cwd = join(root, "cwd");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "REFLECTION.md"), "PROJECT PROMPT");
    writeFileSync(join(home, "REFLECTION.md"), "HOME PROMPT");
    try {
      expect(loadReflectionPrompt({ cwd, home })).toBe("PROJECT PROMPT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseProposals", () => {
  test("parses JSON array", () => {
    const items = parseProposals(`[{"title":"A","use_when":"B","body":"C"}]`);
    expect(items).toEqual([{ title: "A", use_when: "B", body: "C" }]);
  });

  test("parses fenced JSON", () => {
    const items = parseProposals('```json\n[{"title":"A","use_when":"B","body":"C"}]\n```');
    expect(items[0]?.title).toBe("A");
  });
});

describe("reflect", () => {
  test("writes cards via mocked completer", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(transcript, "We learned that Stripe returns 200 with error body.");
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        completer: async () =>
          JSON.stringify([
            {
              title: "Stripe 200 error body",
              use_when: "Stripe HTTP",
              body: "Check JSON error on 200.",
            },
          ]),
      });
      expect(result.written).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
