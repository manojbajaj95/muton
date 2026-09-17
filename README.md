```
  __  __ _    _ _______ ____  _   _ 
 |  \/  | |  | |__   __/ __ \| \ | |
 | \  / | |  | |  | | | |  | |  \| |
 | |\/| | |  | |  | | | |  | | . ` |
 | |  | | |__| |  | | | |__| | |\  |
 |_|  |_|\____/   |_|  \____/|_| \_|
```

![npm](https://img.shields.io/npm/v/mutoncli)
![available harness](https://img.shields.io/badge/available_harness-codex%7Cclaude%7Ccursor%7Cpi-informational)

> A muton is the smallest unit of DNA or a chromosome that can change to cause a mutation.

## Why Muton

Muton is durable project memory for coding agents. Each session starts empty, so the same API quirk or workaround is often found again. Muton stores durable facts as Cards and injects relevant ones when work starts. Cursor, Claude Code, Codex, and Pi share the Cards within a project.

Inspired by [Mozilla cq](https://github.com/mozilla-ai/cq). 

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

Pass only the hosts you use. Cards are stored in `<project>/.agents/muton/cards/`. Runtime jobs, logs, and sanitized transcript archives are stored in `~/.agents/muton/`.

## How it works

1. At session start and on each prompt, Muton searches Cards and injects matches as hidden context.
2. At session end, Muton extracts and sanitizes the transcript, archives that immutable snapshot, and starts a reflection job in the background.
3. An isolated host CLI or direct model turns the sanitized transcript into validated proposals. Muton commits those proposals to the current project's Cards.

Reflection never resumes the task session. Select an extractor with `MUTON_REFLECTION_BACKEND=codex` (also `claude`, `cursor`, or `pi`) or `openai`, `anthropic`, or `openai-compatible`. Set `MUTON_REFLECTION_MODEL` when an explicit model is needed. Direct backends use `MUTON_API_KEY` and optionally `MUTON_API_BASE`.

For manual reflection, `--backend` selects the extractor and `--model` optionally pins its model:

```bash
muton reflect --transcript session.jsonl --backend codex
muton reflect --transcript session.jsonl --backend openai --model <model-id>
```

Benchmark runners can wait for dependent learning before starting another session:

```bash
muton reflect wait --session-id <id> --timeout-ms 120000
```

See [Architecture](docs/architecture.md) for the storage and isolation boundaries.

If hooks are not available, use MCP (`muton mcp`) or the skill and CLI (`muton search`, `muton propose`).

## Develop

Read the [CONTRIBUTING](CONTRIBUTING.md) guidelines before you change the code.

## License

MIT
