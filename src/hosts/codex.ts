import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type HookEntry = {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
};

/** Merge Muton hooks into ~/.codex/hooks.json */
export function installCodex(): string {
  const path = join(homedir(), ".codex", "hooks.json");
  mkdirSync(dirname(path), { recursive: true });
  let doc: { description?: string; hooks?: Record<string, HookEntry[]> } = {
    description: "Codex lifecycle hooks",
    hooks: {},
  };
  if (existsSync(path)) {
    try {
      doc = JSON.parse(readFileSync(path, "utf8")) as typeof doc;
    } catch {
      // replace
    }
  }
  doc.hooks = doc.hooks ?? {};

  const ensure = (event: string, cmdEvent: string, timeout?: number) => {
    const cmd = `muton hook ${cmdEvent} --host codex`;
    const groups = doc.hooks![event] ?? [];
    const already = groups.some((g) => g.hooks?.some((h) => h.command?.includes("muton hook")));
    if (!already) {
      const hook: { type: string; command: string; timeout?: number } = {
        type: "command",
        command: cmd,
      };
      if (timeout !== undefined) hook.timeout = timeout;
      groups.push({ hooks: [hook] });
      doc.hooks![event] = groups;
    }
  };

  ensure("SessionStart", "session-start");
  ensure("UserPromptSubmit", "prompt-submit");
  ensure("SessionEnd", "session-end", 3);

  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  return path;
}
