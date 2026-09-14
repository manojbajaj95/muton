import { installClaude } from "./claude.ts";
import { installCodex } from "./codex.ts";
import { installCursor } from "./cursor.ts";
import { installPi } from "./pi.ts";

export type HostTarget = "cursor" | "claude" | "codex" | "pi";

export function installHosts(targets: HostTarget[]): Record<string, string> {
  const results: Record<string, string> = {};
  for (const t of targets) {
    switch (t) {
      case "cursor":
        results.cursor = installCursor();
        break;
      case "claude":
        results.claude = installClaude();
        break;
      case "codex":
        results.codex = installCodex();
        break;
      case "pi":
        results.pi = installPi();
        break;
    }
  }
  return results;
}

export function parseTargets(raw: string): HostTarget[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set<HostTarget>(["cursor", "claude", "codex", "pi"]);
  const out: HostTarget[] = [];
  for (const p of parts) {
    if (!allowed.has(p as HostTarget)) {
      throw new Error(`Unknown target: ${p}. Use cursor,claude,codex,pi`);
    }
    out.push(p as HostTarget);
  }
  if (out.length === 0) throw new Error("Provide at least one --target");
  return out;
}

export { installClaude, installCodex, installCursor, installPi };
