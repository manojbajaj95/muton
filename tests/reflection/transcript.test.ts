import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeTranscript } from "../../src/reflection/transcript/index.ts";

describe("transcript sanitization", () => {
  test("keeps semantic messages and tool outcomes while removing private payloads", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-transcript-"));
    const path = join(root, "session.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify({
          type: "message",
          timestamp: "2026-01-01T00:00:00Z",
          usage: { tokens: 40 },
          message: {
            role: "user",
            content: [
              { type: "text", text: "Check the endpoint." },
              { type: "image", source: { data: "secret-image-payload" } },
            ],
          },
        }),
        JSON.stringify({
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "private chain of thought" },
              { type: "text", text: "I will inspect it." },
            ],
          },
        }),
        JSON.stringify({
          type: "tool_execution_end",
          toolName: "curl",
          args: { url: "https://example.test", timestamp: "remove-me" },
          result: "HTTP 409 requires If-Match",
          duration: 123,
        }),
        JSON.stringify({ type: "usage", input_tokens: 90 }),
      ].join("\n"),
    );
    try {
      const value = sanitizeTranscript({ path, host: "pi", sessionId: "s1" });
      const serialized = JSON.stringify(value);
      expect(serialized).toContain("HTTP 409 requires If-Match");
      expect(serialized).toContain("https://example.test");
      expect(serialized).not.toContain("private chain of thought");
      expect(serialized).not.toContain("secret-image-payload");
      expect(serialized).not.toContain("remove-me");
      expect(serialized).not.toContain("input_tokens");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("extracts Claude tool_result blocks as tool evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-transcript-claude-"));
    const path = join(root, "session.jsonl");
    writeFileSync(
      path,
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "x", content: "verified output" }],
        },
      }),
    );
    try {
      const value = sanitizeTranscript({ path, host: "claude", sessionId: "s1" });
      expect(value.records).toEqual([
        { id: "r1", role: "tool", name: "tool", text: "verified output", is_error: false },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("normalizes Codex and Cursor message records with the same canonical schema", () => {
    const root = mkdtempSync(join(tmpdir(), "muton-transcript-hosts-"));
    const codexPath = join(root, "codex.jsonl");
    const cursorPath = join(root, "cursor.jsonl");
    writeFileSync(
      codexPath,
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Codex observation" }],
        },
      }),
    );
    writeFileSync(
      cursorPath,
      JSON.stringify({
        role: "assistant",
        timestamp: "remove",
        usage: { total_tokens: 3 },
        content: [{ type: "text", text: "Cursor observation" }],
      }),
    );
    try {
      expect(
        sanitizeTranscript({ path: codexPath, host: "codex", sessionId: "c1" }).records[0]?.text,
      ).toBe("Codex observation");
      expect(
        sanitizeTranscript({ path: cursorPath, host: "cursor", sessionId: "c2" }).records[0]?.text,
      ).toBe("Cursor observation");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
