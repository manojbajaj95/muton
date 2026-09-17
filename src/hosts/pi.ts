import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const EXTENSION = `// Muton Pi extension — inject project Cards, queue isolated reflection
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export default function (pi) {
  if (process.env.MUTON_REFLECTION_PROCESS === "1") return;

  pi.on("before_agent_start", async (event, ctx) => {
    try {
      const prompt = event.prompt ?? "";
      const out = await runMuton(["search", "--json", prompt || "project"], undefined, ctx?.cwd, 1500);
      const data = JSON.parse(out);
      if (!data.context) return;
      return { systemPrompt: event.systemPrompt + "\\n\\n" + data.context };
    } catch (error) {
      log("search_failed", error);
      return;
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const file = ctx.sessionManager?.getSessionFile?.();
      if (!file || !existsSync(file)) return;
      const sessionId = ctx.sessionManager?.getSessionId?.() ?? "unknown";
      const input = JSON.stringify({
        hook_event_name: "session_shutdown",
        session_id: sessionId,
        transcript_path: file,
        cwd: ctx?.cwd ?? process.cwd(),
      });
      await runMuton(["hook", "session-end", "--host", "pi"], input, ctx?.cwd, 2500);
    } catch (error) {
      log("shutdown_failed", error);
    }
  });
}

function runMuton(args, input, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("muton", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(stdout);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("muton timed out after " + timeoutMs + "ms"));
    }, timeoutMs);
    child.stdout.on("data", (data) => (stdout += String(data)));
    child.stderr.on("data", (data) => (stderr += String(data)));
    child.on("error", finish);
    child.on("close", (code) =>
      code === 0 ? finish() : finish(new Error(stderr || stdout || "muton exited " + code)),
    );
    child.stdin.end(input ?? "");
  });
}

function log(event, error) {
  try {
    const path = join(homedir(), ".agents", "muton", "runtime", "logs", "pi-extension.jsonl");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    appendFileSync(path, JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      error: error instanceof Error ? error.message : String(error),
    }) + "\\n", { mode: 0o600 });
  } catch {}
}
`;

/** Install Pi extension to ~/.pi/agent/extensions/muton.ts */
export function installPi(): string {
  const path = join(homedir(), ".pi", "agent", "extensions", "muton.ts");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, EXTENSION);
  return path;
}
