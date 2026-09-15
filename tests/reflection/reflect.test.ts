import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProposals, RESUME_EXTRACT_PROMPT, reflect } from "../../src/reflection/index.ts";
import { DEFAULT_REFLECTION_PROMPT, loadReflectionPrompt } from "../../src/reflection/prompt.ts";
import { writeProposedCards } from "../../src/reflection/writer.ts";
import { CardStore } from "../../src/store/index.ts";

describe("reflection prompt", () => {
  test("appends project REFLECTION.md to the default prompt", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-prompt-"));
    const home = join(root, "home");
    const cwd = join(root, "cwd");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "REFLECTION.md"), "PROJECT PROMPT");
    writeFileSync(join(home, "REFLECTION.md"), "HOME PROMPT");
    try {
      expect(loadReflectionPrompt({ cwd, home })).toBe(
        `${DEFAULT_REFLECTION_PROMPT}\n\nPROJECT PROMPT`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appends home REFLECTION.md when the project has none", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-prompt-home-"));
    const home = join(root, "home");
    const cwd = join(root, "cwd");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(home, "REFLECTION.md"), "HOME PROMPT");
    try {
      expect(loadReflectionPrompt({ cwd, home })).toBe(
        `${DEFAULT_REFLECTION_PROMPT}\n\nHOME PROMPT`,
      );
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

  test("returns empty for unparsable text", () => {
    expect(parseProposals("not json")).toEqual([]);
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
        completer: async (req) => {
          expect(req.user).toBe("We learned that Stripe returns 200 with error body.");
          expect(req.user).not.toContain("Existing card titles");
          expect(req.system).toContain("The store merges near-duplicates");
          return JSON.stringify([
            {
              title: "Stripe 200 error body",
              use_when: "Stripe HTTP",
              body: "Check JSON error on 200.",
            },
          ]);
        },
      });
      expect(result.written).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns zero writes on empty transcript without calling the model", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(transcript, "   \n");
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        completer: async () => {
          throw new Error("completer should not run");
        },
      });
      expect(result.written).toBe(0);
      expect(result.skipped).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("updates an existing card instead of writing a second copy", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(
      transcript,
      "Stripe still returns 200 with an error body; parse the error field.",
    );
    const store = new CardStore(root);
    store.writeNew({
      title: "Stripe rate limit returns 200",
      use_when: "Stripe HTTP responses",
      body: "Read JSON error even when status is 200.",
    });
    store.close();
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        completer: async (req) => {
          expect(req.user).toBe(
            "Stripe still returns 200 with an error body; parse the error field.",
          );
          expect(req.user).not.toContain("Existing card titles");
          return JSON.stringify([
            {
              title: "Stripe 200 error body",
              use_when: "Handling Stripe HTTP",
              body: "Read JSON error even when status is 200. Parse the error field.",
            },
          ]);
        },
      });
      expect(result.written).toBe(1);
      expect(result.skipped).toBe(0);
      const after = new CardStore(root);
      try {
        expect(after.cardCount()).toBe(1);
        expect(after.read("stripe-rate-limit-returns-200")?.body).toContain("error field");
      } finally {
        after.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resume uses a short extract prompt and skips the transcript", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(transcript, "We learned that Stripe returns 200 with error body.");
    const calls: Array<{ user: string; sessionId?: string }> = [];
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        sessionId: "sess-1",
        completer: async (req) => {
          calls.push({ user: req.user, sessionId: req.sessionId });
          expect(req.user).toBe(RESUME_EXTRACT_PROMPT);
          expect(req.user).not.toContain("Existing card titles");
          expect(req.sessionId).toBe("sess-1");
          return JSON.stringify([
            {
              title: "Stripe 200 error body",
              use_when: "Stripe HTTP",
              body: "Check JSON error on 200.",
            },
          ]);
        },
      });
      expect(result.written).toBe(1);
      expect(calls).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("empty resume JSON array is success and does not fall back", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(transcript, "nothing durable here");
    let calls = 0;
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        sessionId: "sess-1",
        completer: async () => {
          calls += 1;
          return "[]";
        },
      });
      expect(result.written).toBe(0);
      expect(calls).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("falls back to the transcript when resume output is not JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(transcript, "We learned that Stripe returns 200 with error body.");
    const users: string[] = [];
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        sessionId: "sess-1",
        completer: async (req) => {
          users.push(req.user);
          if (req.sessionId) return "not json at all";
          return JSON.stringify([
            {
              title: "Stripe 200 error body",
              use_when: "Stripe HTTP",
              body: "Check JSON error on 200.",
            },
          ]);
        },
      });
      expect(result.written).toBe(1);
      expect(users[0]).toBe(RESUME_EXTRACT_PROMPT);
      expect(users[1]).toBe("We learned that Stripe returns 200 with error body.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("falls back to the transcript when resume throws", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const transcript = join(root, "t.txt");
    writeFileSync(transcript, "We learned that Stripe returns 200 with error body.");
    try {
      const result = await reflect({
        transcriptPath: transcript,
        home: root,
        sessionId: "sess-1",
        completer: async (req) => {
          if (req.sessionId) throw new Error("session gone");
          return JSON.stringify([
            {
              title: "Stripe 200 error body",
              use_when: "Stripe HTTP",
              body: "Check JSON error on 200.",
            },
          ]);
        },
      });
      expect(result.written).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("writeProposedCards", () => {
  test("skips invalid proposals", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-writer-"));
    const store = new CardStore(root);
    try {
      const result = writeProposedCards(store, [
        { title: "", use_when: "x", body: "y" },
        { title: "Ok", use_when: "when", body: "fact" },
      ]);
      expect(result.skipped).toEqual(["(invalid)"]);
      expect(result.written).toHaveLength(1);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
