import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  enqueueReflection,
  runReflectionJob,
  waitForReflection,
} from "../../src/reflection/jobs.ts";
import { CardStore } from "../../src/store/index.ts";

describe("reflection jobs", () => {
  test("archives once, waits for completion, and makes the Card visible to a fresh store", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-job-"));
    const project = join(root, "project");
    const runtime = join(root, "global");
    const cardHome = join(project, ".agents", "muton");
    const raw = join(root, "session.jsonl");
    writeFileSync(
      raw,
      [
        JSON.stringify({ role: "user", content: "Inspect Stripe." }),
        JSON.stringify({
          type: "tool_execution_end",
          toolName: "curl",
          result: "Stripe returned HTTP 200 with an error field.",
        }),
      ].join("\n"),
    );
    try {
      const first = enqueueReflection({
        transcriptPath: raw,
        sourceHost: "pi",
        sessionId: "session-A",
        cwd: project,
        cardHome,
        runtimeHome: runtime,
        spawnWorker: false,
      });
      const duplicate = enqueueReflection({
        transcriptPath: raw,
        sourceHost: "pi",
        sessionId: "session-A",
        cwd: project,
        cardHome,
        runtimeHome: runtime,
        spawnWorker: false,
      });
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.job.id).toBe(first.job.id);
      expect(readFileSync(first.job.transcript_path, "utf8")).not.toContain("timestamp");

      let completionCalls = 0;
      const complete = async () => {
        completionCalls += 1;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
        return {
          text: JSON.stringify([
            {
              title: "Stripe error in HTTP 200",
              use_when: "handling Stripe API responses",
              body: "Inspect the error field even when the status is HTTP 200.",
              evidence: ["r2"],
            },
          ]),
          model: "test-model",
          usage: { inputTokens: 12, outputTokens: 7 },
          costUsd: 0.02,
        };
      };
      const waiting = waitForReflection({
        sessionId: "session-A",
        cwd: project,
        runtimeHome: runtime,
        timeoutMs: 500,
      });
      const activeRun = runReflectionJob(runtime, first.job.id, complete);
      const overlappingRun = runReflectionJob(runtime, first.job.id, complete);
      const [finished, overlap, waited] = await Promise.all([activeRun, overlappingRun, waiting]);
      expect(finished.status).toBe("completed");
      expect(finished.completion?.model).toBe("test-model");
      expect(overlap.status).toBe("running");
      expect(completionCalls).toBe(1);
      expect(waited.id).toBe(first.job.id);
      const secondRun = await runReflectionJob(runtime, first.job.id, async () => {
        throw new Error("completed jobs must not run twice");
      });
      expect(secondRun.status).toBe("completed");

      const fresh = new CardStore(cardHome);
      try {
        expect(fresh.searchRaw("Stripe HTTP 200 error")).toHaveLength(1);
      } finally {
        fresh.close();
      }

      writeFileSync(
        raw,
        `${readFileSync(raw, "utf8")}\n${JSON.stringify({ role: "assistant", content: "new version" })}`,
      );
      const malformed = enqueueReflection({
        transcriptPath: raw,
        sourceHost: "pi",
        sessionId: "session-A",
        cwd: project,
        cardHome,
        runtimeHome: runtime,
        spawnWorker: false,
      });
      const failed = await runReflectionJob(runtime, malformed.job.id, async () => ({
        text: "not JSON",
      }));
      expect(failed.status).toBe("failed");
      expect(failed.error?.message).toContain("not valid JSON");
      expect(readFileSync(join(runtime, "runtime", "logs", "reflection.jsonl"), "utf8")).toContain(
        '"event":"failed"',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
