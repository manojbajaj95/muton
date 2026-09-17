import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseProposals,
  ReflectionOutputError,
  reflectCanonical,
} from "../../src/reflection/index.ts";
import { DEFAULT_REFLECTION_PROMPT, loadReflectionPrompt } from "../../src/reflection/prompt.ts";
import type { CanonicalTranscript } from "../../src/reflection/transcript/index.ts";
import { CardStore } from "../../src/store/index.ts";

const transcript: CanonicalTranscript = {
  schema_version: 1,
  host: "codex",
  session_id: "sess-1",
  records: [
    { id: "r1", role: "user", text: "Investigate Stripe." },
    { id: "r2", role: "tool", name: "curl", text: "HTTP 200 { error: rate_limited }" },
  ],
};

describe("reflection prompt", () => {
  test("uses project, project-store, then global runtime prompt precedence", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-prompt-"));
    const home = join(root, "project-store");
    const runtime = join(root, "runtime");
    const cwd = join(root, "cwd");
    mkdirSync(home, { recursive: true });
    mkdirSync(runtime, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(home, "REFLECTION.md"), "STORE PROMPT");
    writeFileSync(join(runtime, "REFLECTION.md"), "GLOBAL PROMPT");
    writeFileSync(join(cwd, "REFLECTION.md"), "PROJECT PROMPT");
    try {
      expect(loadReflectionPrompt({ cwd, home, runtimeHome: runtime })).toBe(
        `${DEFAULT_REFLECTION_PROMPT}\n\nPROJECT PROMPT`,
      );
      rmSync(join(cwd, "REFLECTION.md"));
      expect(loadReflectionPrompt({ cwd, home, runtimeHome: runtime })).toContain("STORE PROMPT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseProposals", () => {
  test("distinguishes valid empty output from malformed output", () => {
    expect(parseProposals("[]", transcript)).toEqual([]);
    expect(() => parseProposals("not json", transcript)).toThrow(ReflectionOutputError);
  });

  test("rejects invalid, oversized, and unsupported proposals", () => {
    expect(() => parseProposals('[{"title":"A","use_when":"B","body":"C"}]', transcript)).toThrow(
      /contract/,
    );
    const six = Array.from({ length: 6 }, (_, index) => ({
      title: `A${index}`,
      use_when: "B",
      body: "C",
      evidence: ["r2"],
    }));
    expect(() => parseProposals(JSON.stringify(six), transcript)).toThrow(/contract/);
    try {
      parseProposals(
        JSON.stringify([{ title: "A", use_when: "B", body: "C", evidence: ["r1"] }]),
        transcript,
      );
      throw new Error("expected invalid evidence");
    } catch (error) {
      expect(error).toBeInstanceOf(ReflectionOutputError);
      expect((error as ReflectionOutputError).reasons.join(" ")).toContain("assistant or tool");
    }
  });
});

describe("reflectCanonical", () => {
  test("writes a provenance-carrying Card from the sanitized transcript", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-"));
    const home = join(root, "project", ".agents", "muton");
    try {
      const result = await reflectCanonical({
        transcript,
        transcriptHash: "abc123",
        projectRoot: join(root, "project"),
        cardHome: home,
        runtimeHome: join(root, "runtime"),
        completer: async (request) => {
          expect(request.user).toContain('"id":"r2"');
          expect(request.user).not.toContain("thinking");
          expect(request.system).toContain(`Project root: ${join(root, "project")}`);
          expect(request.cwd).not.toBe(join(root, "project"));
          return {
            text: JSON.stringify([
              {
                title: "Stripe 200 error body",
                use_when: "handling Stripe HTTP responses",
                body: "Inspect the JSON error field even when Stripe returns HTTP 200.",
                evidence: ["r2"],
              },
            ]),
            provider: "test",
            model: "extractor-1",
            usage: { inputTokens: 10, outputTokens: 5 },
            costUsd: 0.01,
          };
        },
      });
      expect(result.created).toBe(1);
      const store = new CardStore(home);
      try {
        const card = store.listCards()[0];
        expect(card?.sources).toEqual([{ session_id: "sess-1", transcript_hash: "abc123" }]);
      } finally {
        store.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not resume the source session and accepts a valid no-op", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-reflect-empty-"));
    try {
      const result = await reflectCanonical({
        transcript,
        projectRoot: root,
        cardHome: join(root, ".agents", "muton"),
        runtimeHome: join(root, "runtime"),
        completer: async (request) => {
          expect(Object.keys(request)).not.toContain("sessionId");
          return { text: "[]" };
        },
      });
      expect(result.written).toBe(0);
      expect(result.skipped).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
