import { spawn } from "node:child_process";
import type { CompleteRequest, CompletionResult, CompletionUsage, HostName } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 2_000_000;

export function buildHostCommand(
  host: HostName,
  prompt: string,
  model?: string,
): { cmd: string; args: string[] } {
  switch (host) {
    case "claude": {
      const args = [
        "-p",
        "--tools",
        "",
        "--output-format",
        "json",
        "--no-session-persistence",
        "--settings",
        JSON.stringify({ disableAllHooks: true }),
      ];
      if (model) args.push("--model", model);
      args.push(prompt);
      return { cmd: "claude", args };
    }
    case "cursor": {
      const args = ["-p", "--mode", "ask", "--sandbox", "enabled", "--output-format", "json"];
      if (model) args.push("--model", model);
      args.push(prompt);
      return { cmd: "agent", args };
    }
    case "codex": {
      const args = [
        "exec",
        "--ephemeral",
        "--disable",
        "hooks",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--json",
      ];
      if (model) args.push("--model", model);
      args.push(prompt);
      return { cmd: "codex", args };
    }
    case "pi": {
      const args = [
        "--no-session",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-context-files",
        "--no-tools",
        "--mode",
        "json",
      ];
      if (model) args.push("--model", model);
      args.push("-p", prompt);
      return { cmd: "pi", args };
    }
  }
}

export async function completeViaHostCli(
  backend: { kind: "host"; host: HostName; model?: string },
  req: CompleteRequest,
): Promise<CompletionResult> {
  const prompt = `${req.system}\n\n---\n\n${req.user}`;
  const { cmd, args } = buildHostCommand(backend.host, prompt, backend.model);
  const stdout = await run(cmd, args, {
    cwd: req.cwd,
    timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  return parseHostOutput(backend.host, stdout, backend.model);
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: isolatedEnvironment(),
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      terminate(child.pid);
      finish(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout);
    };

    child.stdout.on("data", (data) => {
      stdout += String(data);
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        terminate(child.pid);
        finish(new Error(`${cmd} exceeded the output limit`));
      }
    });
    child.stderr.on("data", (data) => {
      stderr = `${stderr}${String(data)}`.slice(-32_000);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function isolatedEnvironment(): NodeJS.ProcessEnv {
  const keys = [
    "PATH",
    "HOME",
    "USER",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "PI_CODING_AGENT_DIR",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "CURSOR_API_KEY",
  ];
  const env: NodeJS.ProcessEnv = { MUTON_REFLECTION_PROCESS: "1" };
  for (const key of keys) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}

function terminate(pid?: number): void {
  if (!pid) return;
  try {
    if (process.platform !== "win32") process.kill(-pid, "SIGTERM");
    else process.kill(pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
  setTimeout(() => {
    try {
      if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
      else process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }, 2_000).unref();
}

function parseHostOutput(host: HostName, raw: string, requestedModel?: string): CompletionResult {
  if (host === "claude" || host === "cursor") {
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const usage = usageFromRecord(value.usage);
      return {
        text: string(value.result) ?? string(value.text) ?? raw,
        provider: string(value.provider),
        model: string(value.model) ?? requestedModel,
        usage,
        costUsd: number(value.total_cost_usd) ?? number(value.cost_usd) ?? null,
      };
    } catch {
      return { text: raw, model: requestedModel, costUsd: null };
    }
  }

  let text = "";
  let provider: string | undefined;
  let model = requestedModel;
  let usage: CompletionUsage | undefined;
  let costUsd: number | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (host === "codex") {
        const item = isRecord(event.item) ? event.item : undefined;
        if (event.type === "item.completed" && item?.type === "agent_message") {
          text = string(item.text) ?? text;
        }
        if (event.type === "turn.completed") usage = usageFromRecord(event.usage) ?? usage;
      } else if (host === "pi" && event.type === "message_end" && isRecord(event.message)) {
        const message = event.message;
        if (message.role === "assistant") {
          text = textContent(message.content) || text;
          provider = string(message.provider) ?? provider;
          model = string(message.model) ?? model;
          usage = usageFromRecord(message.usage) ?? usage;
          const cost =
            isRecord(message.usage) && isRecord(message.usage.cost)
              ? number(message.usage.cost.total)
              : undefined;
          if (cost !== undefined) costUsd = cost;
        }
      }
    } catch {
      // Ignore non-JSON diagnostic lines; exit status still controls success.
    }
  }
  return { text: text || raw, provider, model, usage, costUsd };
}

function usageFromRecord(value: unknown): CompletionUsage | undefined {
  if (!isRecord(value)) return undefined;
  const usage: CompletionUsage = {
    inputTokens: number(value.input_tokens) ?? number(value.input),
    outputTokens: number(value.output_tokens) ?? number(value.output),
    cacheReadTokens: number(value.cached_input_tokens) ?? number(value.cacheRead),
    cacheWriteTokens: number(value.cacheWrite),
  };
  return Object.values(usage).some((entry) => entry !== undefined) ? usage : undefined;
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .filter(isRecord)
    .filter((part) => part.type === "text")
    .map((part) => string(part.text) ?? "")
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
