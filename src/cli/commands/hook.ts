import { type HookEventName, runHook } from "../../hooks/index.ts";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c) => chunks.push(Buffer.from(c)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

export async function cmdHook(args: string[]): Promise<void> {
  const event = args[0] as HookEventName | undefined;
  if (!event || !["session-start", "prompt-submit", "session-end"].includes(event)) {
    console.error("Usage: muton hook <session-start|prompt-submit|session-end> [--host <name>]");
    process.exit(1);
  }
  const hostIdx = args.indexOf("--host");
  const host =
    hostIdx >= 0 ? (args[hostIdx + 1] as "claude" | "cursor" | "codex" | "pi") : undefined;

  let raw: unknown = {};
  if (!process.stdin.isTTY) {
    const text = await readStdin();
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = {};
      }
    }
  }

  const out = runHook(event, raw, { host });
  // Always emit JSON for hosts that consume stdout; keep empty-ish for session-end
  if (event === "session-end") {
    process.stdout.write("{}\n");
  } else {
    process.stdout.write(`${JSON.stringify(out)}\n`);
  }
}
