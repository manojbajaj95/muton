import { reflect } from "../../reflection/index.ts";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

export async function cmdReflect(args: string[]): Promise<void> {
  const transcript = flag(args, "--transcript");
  if (!transcript) {
    console.error(
      "Usage: muton reflect --transcript <path> [--cwd <dir>] [--host <name>] [--session-id <id>]",
    );
    process.exit(1);
  }
  const cwd = flag(args, "--cwd");
  const host = flag(args, "--host") as "claude" | "cursor" | "codex" | "pi" | "auto" | undefined;
  const sessionId = flag(args, "--session-id");
  const result = await reflect({ transcriptPath: transcript, cwd, host, sessionId });
  // Silent for hooks: only write minimal line to stderr for operators
  console.error(`muton reflect: written=${result.written} skipped=${result.skipped}`);
}
