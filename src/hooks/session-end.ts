import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CardStore, tmpDir } from "../store/index.ts";
import type { CanonicalEvent } from "./normalize.ts";
import type { HookOutput } from "./session-start.ts";

function resolveMutonBin(): string {
  const entry = process.argv[1];
  if (entry && existsSync(entry)) return process.execPath;
  return "muton";
}

export function resolveReflectArgs(
  transcriptCopy: string,
  cwd?: string,
  host?: string,
  sessionId?: string,
): string[] {
  const entry = process.argv[1];
  const args =
    entry && existsSync(entry)
      ? [entry, "reflect", "--transcript", transcriptCopy]
      : ["reflect", "--transcript", transcriptCopy];
  if (cwd) args.push("--cwd", cwd);
  if (host) args.push("--host", host);
  if (sessionId && sessionId !== "unknown") args.push("--session-id", sessionId);
  return args;
}

/** Fire-and-forget session end: copy transcript, detach reflect, silent exit. */
export function handleSessionEnd(
  event: Extract<CanonicalEvent, { type: "session-end" }>,
  home?: string,
): HookOutput {
  const store = new CardStore(home);
  try {
    const src = event.transcriptPath;
    if (!src || !existsSync(src)) {
      return { continue: true, suppressOutput: true };
    }
    const destDir = tmpDir(store.home);
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, `${event.sessionId}-${Date.now()}.transcript`);
    copyFileSync(src, dest);

    const bin = resolveMutonBin();
    const args = resolveReflectArgs(dest, event.cwd, event.host, event.sessionId);
    const child = spawn(bin, args, {
      detached: true,
      stdio: "ignore",
      env: process.env,
      cwd: event.cwd ?? process.cwd(),
    });
    child.unref();
  } catch {
    // never block session end
  } finally {
    store.close();
  }
  return { continue: true, suppressOutput: true };
}
