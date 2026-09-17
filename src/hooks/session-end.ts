import { existsSync } from "node:fs";
import { enqueueReflection, recordRuntimeEvent } from "../reflection/jobs.ts";
import { mutonHome } from "../store/fs.ts";
import type { CanonicalEvent } from "./normalize.ts";
import type { HookOutput } from "./session-start.ts";

/** Snapshot and queue reflection before returning; model work remains detached. */
export function handleSessionEnd(
  event: Extract<CanonicalEvent, { type: "session-end" }>,
  home?: string,
  runtimeHome?: string,
): HookOutput {
  if (process.env.MUTON_REFLECTION_PROCESS === "1") {
    return { continue: true, suppressOutput: true };
  }
  try {
    const src = event.transcriptPath;
    if (!src || !existsSync(src) || !event.host) {
      return { continue: true, suppressOutput: true };
    }
    enqueueReflection({
      transcriptPath: src,
      sourceHost: event.host,
      sessionId: event.sessionId,
      cwd: event.cwd,
      cardHome: home ?? mutonHome(undefined, event.cwd),
      runtimeHome,
    });
  } catch (error) {
    recordRuntimeEvent(runtimeHome, {
      event: "enqueue_failed",
      host: event.host,
      session_id: event.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { continue: true, suppressOutput: true };
}
