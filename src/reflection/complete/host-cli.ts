import { spawn } from "node:child_process";
import type { CompleteRequest } from "./types.ts";

export type HostName = "claude" | "cursor" | "codex" | "pi";

export function usableSessionId(id?: string): boolean {
  const s = id?.trim() ?? "";
  return s.length > 0 && s !== "unknown";
}

export function hostSupportsResume(host: HostName | "auto"): boolean {
  return host === "claude" || host === "cursor" || host === "codex" || host === "auto";
}

export function buildHostCommand(
  host: HostName,
  prompt: string,
  sessionId?: string,
): { cmd: string; args: string[] } {
  const resume = usableSessionId(sessionId);
  if (resume && !hostSupportsResume(host)) {
    throw new Error(`${host} has no session resume`);
  }

  switch (host) {
    case "claude": {
      const args = [
        "-p",
        "--tools",
        "",
        "--output-format",
        "json",
        "--settings",
        JSON.stringify({ disableAllHooks: true }),
      ];
      if (resume) args.push("--resume", sessionId!.trim());
      args.push(prompt);
      return { cmd: "claude", args };
    }
    case "cursor": {
      const args = ["-p", "--output-format", "text"];
      if (resume) args.push("--resume", sessionId!.trim());
      args.push(prompt);
      return { cmd: "agent", args };
    }
    case "codex": {
      if (resume) {
        return {
          cmd: "codex",
          args: ["exec", "--sandbox", "read-only", "resume", sessionId!.trim(), prompt],
        };
      }
      return { cmd: "codex", args: ["exec", "--ephemeral", "--sandbox", "read-only", prompt] };
    }
    case "pi":
      return { cmd: "pi", args: ["-p", prompt] };
  }
}

function run(cmd: string, args: string[], opts: { cwd?: string; input?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
    if (opts.input) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

function which(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "where" : "which", [bin], {
      stdio: "ignore",
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function detectHost(preferred?: CompleteRequest["host"]): Promise<HostName> {
  if (preferred && preferred !== "auto") return preferred;
  if (await which("claude")) return "claude";
  if (await which("agent")) return "cursor";
  if (await which("codex")) return "codex";
  if (await which("pi")) return "pi";
  throw new Error("No host CLI found (claude, agent, codex, pi). Set MUTON_MODEL + MUTON_API_KEY.");
}

/** Complete via logged-in host CLI with tools disabled. */
export async function completeViaHostCli(req: CompleteRequest): Promise<string> {
  const host = await detectHost(req.host);
  const prompt = `${req.system}\n\n---\n\n${req.user}`;
  const { cmd, args } = buildHostCommand(host, prompt, req.sessionId);
  const out = await run(cmd, args, { cwd: req.cwd });
  if (host !== "claude") return out;
  try {
    const parsed = JSON.parse(out) as { result?: string };
    return parsed.result ?? out;
  } catch {
    return out;
  }
}
