import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import packageJson from "../../../package.json";
import { runtimeHome } from "../../store/fs.ts";

export const VERSION = packageJson.version;

export function cmdUpdate(): void {
  if (isLocalCheckout()) {
    console.log(
      "Local checkout detected; update it with git pull, then run bun install && bun run build.",
    );
    return;
  }

  const [command, args] = globalUpdateCommand();
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Muton update failed with exit code ${result.status}`);
}

/** Start one silent update per installed version without delaying the command. */
export function maybeAutoUpdate(): void {
  if (process.env.MUTON_NO_AUTO_UPDATE === "1" || isLocalCheckout()) return;
  const marker = join(runtimeHome(), "runtime", "auto-update-version");
  try {
    const lastVersion = existsSync(marker) ? readFileSync(marker, "utf8").trim() : undefined;
    if (!autoUpdateNeeded(lastVersion, false)) return;
    mkdirSync(dirname(marker), { recursive: true, mode: 0o700 });
    writeFileSync(marker, `${VERSION}\n`, { mode: 0o600 });
    const [command, args] = globalUpdateCommand();
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Updating is best-effort and must never break the requested command.
  }
}

export function autoUpdateNeeded(lastVersion: string | undefined, local: boolean): boolean {
  return !local && lastVersion !== VERSION;
}

export function isLocalCheckout(entry = process.argv[1]): boolean {
  if (!entry) return false;
  try {
    const resolved = existsSync(entry) ? realpathSync(entry) : entry;
    return existsSync(join(dirname(dirname(resolved)), ".git"));
  } catch {
    return false;
  }
}

export function globalUpdateCommand(entry = process.argv[1] ?? ""): [string, string[]] {
  let resolvedEntry = entry;
  try {
    resolvedEntry = realpathSync(entry);
  } catch {
    // The caller may be selecting a command for an entry that no longer exists.
  }
  return entry.includes(`${sep}.bun${sep}bin${sep}`) ||
    resolvedEntry.includes(`${sep}.bun${sep}install${sep}global${sep}`)
    ? ["bun", ["add", "-g", "mutoncli@latest"]]
    : ["npm", ["install", "-g", "mutoncli@latest"]];
}
