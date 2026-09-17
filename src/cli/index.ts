#!/usr/bin/env bun
import { cmdHook } from "./commands/hook.ts";
import { cmdInstall } from "./commands/install.ts";
import { cmdMcp } from "./commands/mcp.ts";
import { cmdPropose } from "./commands/propose.ts";
import { cmdReflect } from "./commands/reflect.ts";
import { cmdSearch } from "./commands/search.ts";
import { cmdView } from "./commands/view.ts";

const HELP = `muton — shared hive memory for coding agents

Usage:
  muton install --target cursor,claude,codex,pi
  muton search [--json] <query>
  muton view [--port <number>]
  muton propose --title <t> --use-when <u> --body <b>
  muton reflect --transcript <path> [--cwd <dir>] [--session-id <id>] [--backend <name>] [--model <id>]
  muton reflect wait --session-id <id> [--timeout-ms <ms>] [--transcript-hash <hash>]
  muton hook <session-start|prompt-submit|session-end> [--host <name>]
  muton mcp
`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "install":
      cmdInstall(rest);
      break;
    case "search":
      cmdSearch(rest);
      break;
    case "view":
      await cmdView(rest);
      break;
    case "propose":
      cmdPropose(rest);
      break;
    case "reflect":
      await cmdReflect(rest);
      break;
    case "hook":
      await cmdHook(rest);
      break;
    case "mcp":
      await cmdMcp();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
