import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Global runtime root for jobs, sanitized transcripts, logs, and scratch data. */
export function runtimeHome(override?: string): string {
  if (override) return resolve(override);
  if (process.env.MUTON_RUNTIME_HOME) return resolve(process.env.MUTON_RUNTIME_HOME);
  return join(homedir(), ".agents", "muton");
}

/** Resolve the project root. Git worktrees intentionally get their own local store. */
export function projectRoot(cwd = process.cwd()): string {
  const start = resolve(cwd);
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: start,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1_000,
    }).trim();
  } catch {
    return start;
  }
}

/** Project-local Card store, unless explicitly overridden. */
export function mutonHome(override?: string, cwd?: string): string {
  if (override) return resolve(override);
  if (process.env.MUTON_HOME) {
    return isAbsolute(process.env.MUTON_HOME)
      ? process.env.MUTON_HOME
      : resolve(cwd ?? process.cwd(), process.env.MUTON_HOME);
  }
  return join(projectRoot(cwd), ".agents", "muton");
}

export function cardsDir(home = mutonHome()): string {
  return join(home, "cards");
}

export function indexPath(home = mutonHome()): string {
  return join(home, "index.sqlite");
}

export function tmpDir(home = mutonHome()): string {
  return join(home, "tmp");
}

export function scratchDir(home = mutonHome()): string {
  return join(home, "scratch");
}

export function logsDir(home = mutonHome()): string {
  return join(home, "logs");
}

export function sessionStatePath(home = mutonHome()): string {
  return join(home, "session-injected.json");
}

export function runtimeDir(home = runtimeHome()): string {
  return join(home, "runtime");
}

export function jobsDir(home = runtimeHome()): string {
  return join(runtimeDir(home), "jobs");
}

export function runtimeLogsDir(home = runtimeHome()): string {
  return join(runtimeDir(home), "logs");
}

export function runtimeScratchDir(home = runtimeHome()): string {
  return join(runtimeDir(home), "scratch");
}

export function reflectionScratchDir(key: string, home = runtimeHome()): string {
  return join(runtimeScratchDir(home), key);
}

export function transcriptsDir(home = runtimeHome()): string {
  return join(home, "transcripts");
}
