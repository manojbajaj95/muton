import { parseBackendSpec, selectBackend } from "../../reflection/complete/index.ts";
import { reflect } from "../../reflection/index.ts";
import { runReflectionJob, waitForReflection } from "../../reflection/jobs.ts";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

export async function cmdReflect(args: string[]): Promise<void> {
  if (args[0] === "run") return runJob(args.slice(1));
  if (args[0] === "wait") return wait(args.slice(1));
  if (args.includes("--host")) {
    throw new Error("--host is only used by hooks; use --backend for reflection");
  }

  const transcript = flag(args, "--transcript");
  if (!transcript) {
    throw new Error(
      "Usage: muton reflect --transcript <path> [--cwd <dir>] [--session-id <id>] [--backend <name>] [--model <id>]",
    );
  }
  const cwd = flag(args, "--cwd");
  const sessionId = flag(args, "--session-id");
  const backendValue = flag(args, "--backend");
  const model = flag(args, "--model");
  const backend = backendValue
    ? parseBackendSpec(backendValue, model)
    : selectBackend(undefined, model);
  const result = await reflect({ transcriptPath: transcript, cwd, sessionId, backend });
  console.error(`muton reflect: written=${result.written} skipped=${result.skipped}`);
}

async function runJob(args: string[]): Promise<void> {
  const id = flag(args, "--job");
  const runtimeHome = flag(args, "--runtime-home");
  if (!id || !runtimeHome)
    throw new Error("Usage: muton reflect run --job <id> --runtime-home <dir>");
  const job = await runReflectionJob(runtimeHome, id);
  if (job.status === "failed") throw new Error(job.error?.message ?? "Reflection failed");
}

async function wait(args: string[]): Promise<void> {
  const sessionId = flag(args, "--session-id");
  if (!sessionId)
    throw new Error("Usage: muton reflect wait --session-id <id> [--timeout-ms <ms>]");
  const timeoutValue = flag(args, "--timeout-ms");
  const timeoutMs = timeoutValue ? Number(timeoutValue) : undefined;
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
    throw new Error("--timeout-ms must be a non-negative number");
  }
  const job = await waitForReflection({
    sessionId,
    cwd: flag(args, "--cwd"),
    runtimeHome: flag(args, "--runtime-home"),
    transcriptHash: flag(args, "--transcript-hash"),
    timeoutMs,
  });
  process.stdout.write(`${JSON.stringify(job)}\n`);
  if (job.status === "failed") throw new Error(job.error?.message ?? "Reflection failed");
}
