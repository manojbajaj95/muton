# muton

A muton is the smallest unit of DNA or a chromosome that can change to cause a mutation.

Shared hive memory for coding agents. Agents store durable facts as **Cards**, retrieve relevant Cards at session start, and silently extract new facts at session end — a hive mind across Cursor, Claude Code, Codex, and Pi.

Inspired by [Mozilla cq](https://github.com/mozilla-ai/cq), without topics, notebooks, or human approval gates. Research preview: no merge, delete, or versioning admin.

## Install

```bash
bun add -g muton
# or
npm install -g muton
```

Wire hooks for your harness(es):

```bash
muton install --target cursor,claude,codex,pi
```

Cards live under `~/.agents/muton/cards/`. Search uses SQLite FTS5 (BM25 + light rerank).

## How it works

1. **Session start / prompt submit** — Muton searches Cards and injects the top hits as hidden context.
2. **Session end** — Muton detaches a silent reflection job. The host CLI (or `MUTON_MODEL` + `MUTON_API_KEY`) proposes new Cards. Users do not see proposals.

If hooks are unavailable, use MCP (`muton mcp`) or the skill + CLI (`muton search`, `muton propose`).

## Override the reflection prompt

Resolution order (first wins):

1. `./REFLECTION.md` in the project
2. `~/.agents/muton/REFLECTION.md`
3. Bundled default in the package

## Optional model override

By default reflection uses the logged-in host CLI (`claude`, `agent`, `codex`, or `pi`). To force HTTP:

```bash
export MUTON_MODEL=claude-haiku-4-5-20251001
export MUTON_API_KEY=sk-...
```

## Develop

```bash
bun install
bun test
bun run typecheck
bun run lint
bun run build
```

## License

MIT
