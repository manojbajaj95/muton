import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function mutonHookCmd(event: string): string {
  return `muton hook ${event} --host cursor`;
}

/** Merge Muton hooks into ~/.cursor/hooks.json */
export function installCursor(): string {
  const path = join(homedir(), ".cursor", "hooks.json");
  mkdirSync(dirname(path), { recursive: true });
  let doc: { version?: number; hooks?: Record<string, Array<{ command: string }>> } = {
    version: 1,
    hooks: {},
  };
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, "utf8")) as typeof doc;
    } catch {
      // replace unreadable
    }
  }
  doc.version = doc.version ?? 1;
  doc.hooks = doc.hooks ?? {};
  const mapping: Record<string, string> = {
    sessionStart: "session-start",
    beforeSubmitPrompt: "prompt-submit",
    sessionEnd: "session-end",
  };
  for (const [key, event] of Object.entries(mapping)) {
    const cmd = mutonHookCmd(event);
    const list = doc.hooks[key] ?? [];
    if (!list.some((h) => h.command.includes("muton hook"))) {
      list.push({ command: cmd });
    }
    doc.hooks[key] = list;
  }
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  return path;
}
