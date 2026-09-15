```
  __  __ _    _ _______ ____  _   _ 
 |  \/  | |  | |__   __/ __ \| \ | |
 | \  / | |  | |  | | | |  | |  \| |
 | |\/| | |  | |  | | | |  | | . ` |
 | |  | | |__| |  | | | |__| | |\  |
 |_|  |_|\____/   |_|  \____/|_| \_|
```

[![npm](https://img.shields.io/npm/v/mutoncli)](https://www.npmjs.com/package/mutoncli)
![available harness](https://img.shields.io/badge/available_harness-codex%7Cclaude%7Ccursor%7Cpi-informational)

> A muton is the smallest unit of DNA or a chromosome that can change to cause a mutation.

## Why Muton

Muton is shared hive memory for coding agents. Each session starts empty, so the same API quirk or workaround is found again. Muton stores durable facts as Cards and injects the relevant ones when work starts. At session end it extracts new facts. Cursor, Claude Code, Codex, and Pi share the same hive.

Inspired by [Mozilla cq](https://github.com/mozilla-ai/cq). Muton has no topics, notebooks, or human approval gates. This is a research preview. Near-duplicate content updates the existing Card slug. Muton does not delete or version Cards.

## Installation

```bash
bun add -g mutoncli
# or
npm install -g mutoncli
```

The command is still `muton`.

Install hooks for your harness:

```bash
muton install --target cursor,claude,codex,pi
```

Pass only the hosts you use. Cards are stored in `~/.agents/muton/cards/`.

## How it works

1. At session start and on each prompt, Muton searches Cards and injects matches as hidden context.
2. At session end, Muton starts a reflection job in the background. The host CLI proposes new Cards. You do not see the proposals.

If hooks are not available, use MCP (`muton mcp`) or the skill and CLI (`muton search`, `muton propose`).

## Develop

Read the [CONTRIBUTING](CONTRIBUTING.md) guidelines before you change the code.

## License

MIT
