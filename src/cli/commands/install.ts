import { detectHosts, type HostTarget, installHosts, parseTargets } from "../../hosts/index.ts";

export function cmdInstall(args: string[]): void {
  const targets = installTargets(args);
  const results = installHosts(targets);
  for (const [host, path] of Object.entries(results)) {
    console.log(`Installed ${host}: ${path}`);
  }
}

export function installTargets(args: string[], home?: string): HostTarget[] {
  if (args.length === 0) {
    const detected = detectHosts(home);
    if (detected.length === 0) {
      throw new Error(
        "No supported coding agents found. Use --target cursor,claude,codex,pi to choose explicitly.",
      );
    }
    return detected;
  }

  const idx = args.indexOf("--target");
  if (idx < 0 || !args[idx + 1]) {
    throw new Error("Usage: muton install [--target cursor,claude,codex,pi]");
  }
  return parseTargets(args[idx + 1]!);
}
