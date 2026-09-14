import { spawn } from "node:child_process";
import type { CompleteRequest } from "./types.ts";

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

async function detectHost(
  preferred?: CompleteRequest["host"],
): Promise<"claude" | "cursor" | "codex" | "pi"> {
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
  const cwd = req.cwd;

  switch (host) {
    case "claude": {
      const out = await run(
        "claude",
        [
          "-p",
          "--tools",
          "",
          "--output-format",
          "json",
          "--settings",
          JSON.stringify({ disableAllHooks: true }),
          prompt,
        ],
        { cwd },
      );
      try {
        const parsed = JSON.parse(out) as { result?: string };
        return parsed.result ?? out;
      } catch {
        return out;
      }
    }
    case "cursor": {
      return run("agent", ["-p", "--output-format", "text", prompt], { cwd });
    }
    case "codex": {
      return run("codex", ["exec", "--ephemeral", "--sandbox", "read-only", prompt], { cwd });
    }
    case "pi": {
      return run("pi", ["-p", prompt], { cwd });
    }
  }
}
