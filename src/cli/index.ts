#!/usr/bin/env bun
import { cmdReplace, cmdRm, cmdShow } from "./commands/cards.ts";
import { cmdHook } from "./commands/hook.ts";
import { cmdInstall } from "./commands/install.ts";
import { cmdMcp } from "./commands/mcp.ts";
import { cmdPropose } from "./commands/propose.ts";
import { cmdReflect } from "./commands/reflect.ts";
import { cmdSearch } from "./commands/search.ts";
import { cmdUpdate, maybeAutoUpdate, VERSION } from "./commands/update.ts";
import { cmdView } from "./commands/view.ts";

const HELP = `muton — shared hive memory for coding agents

Usage:
  muton install
  muton search [--json] <query>
  muton view [--port <number>]
  muton propose [--json] --title <t> --use-when <u> --body <b>
  muton show [--json] <slug>
  muton replace [--json] <slug> [--title <t>] [--use-when <u>] [--body <b>]
  muton rm [--json] <slug>
  muton reflect --transcript <path> [--cwd <dir>] [--session-id <id>] [--backend <name>] [--model <id>]
  muton update
  muton version | -v | --version
  muton mcp
`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (cmd !== "update") maybeAutoUpdate();
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
    case "show":
      cmdShow(rest);
      break;
    case "replace":
      cmdReplace(rest);
      break;
    case "rm":
      cmdRm(rest);
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
    case "update":
      cmdUpdate();
      break;
    case "version":
    case "--version":
    case "-v":
      console.log(VERSION);
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
