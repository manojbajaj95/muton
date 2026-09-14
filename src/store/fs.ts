import { homedir } from "node:os";
import { join } from "node:path";

/** Root hive directory: ~/.agents/muton */
export function mutonHome(override?: string): string {
  if (override) return override;
  if (process.env.MUTON_HOME) return process.env.MUTON_HOME;
  return join(homedir(), ".agents", "muton");
}

export function cardsDir(home = mutonHome()): string {
  return join(home, "cards");
}

export function indexPath(home = mutonHome()): string {
  return join(home, "index.sqlite");
}

export function tmpDir(home = mutonHome()): string {
  return join(home, "tmp");
}

export function scratchDir(home = mutonHome()): string {
  return join(home, "scratch");
}

export function logsDir(home = mutonHome()): string {
  return join(home, "logs");
}

export function sessionStatePath(home = mutonHome()): string {
  return join(home, "session-injected.json");
}
