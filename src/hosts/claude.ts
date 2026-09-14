import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type HookEntry = {
  matcher?: string;
  hooks: Array<{ type: string; command: string }>;
};

/** Merge Muton hooks into ~/.claude/settings.json */
export function installClaude(): string {
  const path = join(homedir(), ".claude", "settings.json");
  mkdirSync(dirname(path), { recursive: true });
  let doc: { hooks?: Record<string, HookEntry[]> } = {};
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, "utf8")) as typeof doc;
    } catch {
      // replace
    }
  }
  doc.hooks = doc.hooks ?? {};

  const ensure = (event: string, cmdEvent: string) => {
    const cmd = `muton hook ${cmdEvent} --host claude`;
    const groups = doc.hooks![event] ?? [];
    const already = groups.some((g) => g.hooks?.some((h) => h.command?.includes("muton hook")));
    if (!already) {
      groups.push({ hooks: [{ type: "command", command: cmd }] });
      doc.hooks![event] = groups;
    }
  };

  ensure("SessionStart", "session-start");
  ensure("UserPromptSubmit", "prompt-submit");
  ensure("SessionEnd", "session-end");

  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  return path;
}
