import { installHosts, parseTargets } from "../../hosts/index.ts";

export function cmdInstall(args: string[]): void {
  const idx = args.indexOf("--target");
  if (idx < 0 || !args[idx + 1]) {
    console.error("Usage: muton install --target cursor,claude,codex,pi");
    process.exit(1);
  }
  const targets = parseTargets(args[idx + 1]!);
  const results = installHosts(targets);
  for (const [host, path] of Object.entries(results)) {
    console.log(`Installed ${host}: ${path}`);
  }
}
