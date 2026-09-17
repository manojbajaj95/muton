import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  jobsDir,
  mutonHome,
  projectRoot,
  runtimeHome as resolveRuntimeHome,
  runtimeLogsDir,
  transcriptsDir,
} from "../store/fs.ts";
import type { BackendSpec, Completer, CompletionUsage, HostName } from "./complete/index.ts";
import { selectBackend } from "./complete/index.ts";
import { ReflectionOutputError, reflectCanonical } from "./index.ts";
import {
  parseCanonicalTranscript,
  sanitizeTranscript,
  serializeCanonicalTranscript,
} from "./transcript/index.ts";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type ReflectionJob = {
  schema_version: 1;
  id: string;
  status: JobStatus;
  project_root: string;
  card_home: string;
  runtime_home: string;
  session_id: string;
  source_host: HostName;
  transcript_hash: string;
  transcript_path: string;
  backend: BackendSpec;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  result?: { created: number; merged: number; equivalent: number };
  completion?: {
    provider?: string;
    model?: string;
    usage?: CompletionUsage;
    cost_usd?: number | null;
  };
  error?: { message: string; reasons?: string[] };
};

export type EnqueueOptions = {
  transcriptPath: string;
  sourceHost: HostName;
  sessionId: string;
  cwd?: string;
  cardHome?: string;
  runtimeHome?: string;
  backend?: BackendSpec;
  spawnWorker?: boolean;
};

export type EnqueueResult = { job: ReflectionJob; duplicate: boolean };

/** Extract, sanitize, and archive before the host hook returns. */
export function enqueueReflection(opts: EnqueueOptions): EnqueueResult {
  const root = projectRoot(opts.cwd);
  const runtime = resolveRuntimeHome(opts.runtimeHome);
  ensureRuntime(runtime);
  const transcript = sanitizeTranscript({
    path: opts.transcriptPath,
    host: opts.sourceHost,
    sessionId: opts.sessionId,
  });
  const serialized = serializeCanonicalTranscript(transcript);
  const transcriptHash = sha256(serialized);
  const projectId = sha256(root).slice(0, 24);
  const sessionDir = join(transcriptsDir(runtime), projectId, safeSegment(opts.sessionId));
  mkdirPrivate(sessionDir);
  const transcriptPath = join(sessionDir, `${transcriptHash}.json`);
  writeImmutable(transcriptPath, serialized);

  const id = sha256(`${root}\0${opts.sessionId}\0${transcriptHash}`);
  const path = jobPath(runtime, id);
  const job: ReflectionJob = {
    schema_version: 1,
    id,
    status: "queued",
    project_root: root,
    card_home: opts.cardHome ? resolve(opts.cardHome) : mutonHome(undefined, root),
    runtime_home: runtime,
    session_id: opts.sessionId,
    source_host: opts.sourceHost,
    transcript_hash: transcriptHash,
    transcript_path: transcriptPath,
    backend: opts.backend ?? selectBackend(opts.sourceHost),
    created_at: new Date().toISOString(),
  };
  const created = writeImmutable(path, `${JSON.stringify(job, null, 2)}\n`);
  if (!created) return { job: readJob(runtime, id), duplicate: true };
  logEvent(runtime, { event: "queued", job_id: id, session_id: opts.sessionId });
  if (opts.spawnWorker !== false) spawnWorker(job);
  return { job, duplicate: false };
}

export async function runReflectionJob(
  runtimeHome: string,
  id: string,
  completer?: Completer,
): Promise<ReflectionJob> {
  let job = readJob(runtimeHome, id);
  if (job.status === "completed" || job.status === "failed") return job;
  const claim = claimJob(runtimeHome, id);
  if (claim === undefined) return readJob(runtimeHome, id);
  try {
    job = readJob(runtimeHome, id);
    if (job.status === "completed" || job.status === "failed") return job;
    return await runClaimedJob(runtimeHome, job, completer);
  } finally {
    closeSync(claim);
    rmSync(jobLockPath(runtimeHome, id), { force: true });
  }
}

async function runClaimedJob(
  runtimeHome: string,
  initialJob: ReflectionJob,
  completer?: Completer,
): Promise<ReflectionJob> {
  let job = initialJob;
  const id = job.id;
  const started = Date.now();
  job = updateJob(runtimeHome, id, {
    status: "running",
    started_at: new Date(started).toISOString(),
    error: undefined,
  });
  logEvent(runtimeHome, { event: "started", job_id: id, backend: job.backend });
  try {
    const transcript = parseCanonicalTranscript(readFileSync(job.transcript_path, "utf8"));
    const result = await reflectCanonical({
      transcript,
      transcriptHash: job.transcript_hash,
      projectRoot: job.project_root,
      cardHome: job.card_home,
      runtimeHome: job.runtime_home,
      backend: job.backend,
      completer,
    });
    job = updateJob(runtimeHome, id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      result: {
        created: result.created,
        merged: result.merged,
        equivalent: result.equivalent,
      },
      completion: result.completion
        ? {
            provider: result.completion.provider,
            model: result.completion.model,
            usage: result.completion.usage,
            cost_usd: result.completion.costUsd,
          }
        : undefined,
    });
    logEvent(runtimeHome, { event: "completed", job_id: id, ...job.result });
    return job;
  } catch (error) {
    const reasons = error instanceof ReflectionOutputError ? error.reasons : undefined;
    job = updateJob(runtimeHome, id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      error: { message: errorMessage(error), reasons },
    });
    logEvent(runtimeHome, { event: "failed", job_id: id, error: job.error });
    return job;
  }
}

export async function waitForReflection(opts: {
  sessionId: string;
  cwd?: string;
  runtimeHome?: string;
  transcriptHash?: string;
  timeoutMs?: number;
}): Promise<ReflectionJob> {
  const runtime = resolveRuntimeHome(opts.runtimeHome);
  const root = projectRoot(opts.cwd);
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  while (true) {
    const matches = listJobs(runtime)
      .filter((job) => job.project_root === root && job.session_id === opts.sessionId)
      .filter((job) => !opts.transcriptHash || job.transcript_hash === opts.transcriptHash)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const job = matches[0];
    if (job && (job.status === "completed" || job.status === "failed")) return job;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for reflection for session ${opts.sessionId}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
}

export function readJob(runtimeHome: string, id: string): ReflectionJob {
  const value = JSON.parse(readFileSync(jobPath(runtimeHome, id), "utf8")) as ReflectionJob;
  if (value.schema_version !== 1 || value.id !== id)
    throw new Error(`Invalid reflection job: ${id}`);
  return value;
}

export function listJobs(runtimeHome: string): ReflectionJob[] {
  try {
    return readdirSync(jobsDir(runtimeHome))
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => {
        try {
          return [readJob(runtimeHome, basename(name, ".json"))];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export function recordRuntimeEvent(
  runtimeHome: string | undefined,
  value: Record<string, unknown>,
): void {
  logEvent(resolveRuntimeHome(runtimeHome), value);
}

function spawnWorker(job: ReflectionJob): void {
  const entry = process.argv[1];
  const localEntry = entry && existsSync(entry) ? entry : undefined;
  const cmd = localEntry ? process.execPath : "muton";
  const args = localEntry
    ? [localEntry, "reflect", "run", "--job", job.id, "--runtime-home", job.runtime_home]
    : ["reflect", "run", "--job", job.id, "--runtime-home", job.runtime_home];
  try {
    const child = spawn(cmd, args, {
      cwd: job.project_root,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, MUTON_REFLECTION_PROCESS: "1" },
    });
    child.once("error", (error) => markSpawnFailure(job, error));
    child.unref();
  } catch (error) {
    markSpawnFailure(job, error);
  }
}

function markSpawnFailure(job: ReflectionJob, error: unknown): void {
  try {
    updateJob(job.runtime_home, job.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
      error: { message: `Could not start reflection worker: ${errorMessage(error)}` },
    });
    logEvent(job.runtime_home, {
      event: "spawn_failed",
      job_id: job.id,
      error: errorMessage(error),
    });
  } catch {
    // The hook must stay silent even if diagnostics cannot be written.
  }
}

function updateJob(runtimeHome: string, id: string, patch: Partial<ReflectionJob>): ReflectionJob {
  const current = readJob(runtimeHome, id);
  const next = { ...current, ...patch };
  const path = jobPath(runtimeHome, id);
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  return next;
}

function writeImmutable(path: string, content: string): boolean {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tmp, "wx", 0o600);
    writeFileSync(fd, content);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  try {
    linkSync(tmp, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
  return true;
}

function claimJob(runtimeHome: string, id: string): number | undefined {
  const path = jobLockPath(runtimeHome, id);
  try {
    return openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      if (Date.now() - statSync(path).mtimeMs > 300_000) {
        rmSync(path, { force: true });
        return openSync(path, "wx", 0o600);
      }
    } catch (retryError) {
      if ((retryError as NodeJS.ErrnoException).code !== "EEXIST") throw retryError;
    }
    return undefined;
  }
}

function ensureRuntime(home: string): void {
  mkdirPrivate(jobsDir(home));
  mkdirPrivate(runtimeLogsDir(home));
  mkdirPrivate(transcriptsDir(home));
}

function mkdirPrivate(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try {
    chmodSync(path, 0o700);
  } catch {
    // Best effort on filesystems without POSIX modes.
  }
}

function logEvent(runtimeHome: string, value: Record<string, unknown>): void {
  try {
    mkdirPrivate(runtimeLogsDir(runtimeHome));
    appendFileSync(
      join(runtimeLogsDir(runtimeHome), "reflection.jsonl"),
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...value })}\n`,
      { mode: 0o600 },
    );
  } catch {
    // Hook diagnostics must not affect the host session.
  }
}

function jobPath(runtimeHome: string, id: string): string {
  return join(jobsDir(runtimeHome), `${id}.json`);
}

function jobLockPath(runtimeHome: string, id: string): string {
  return join(jobsDir(runtimeHome), `${id}.lock`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
