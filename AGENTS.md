# AGENTS.md

## Commands

- `bun test` — unit tests
- `bun run typecheck` — `tsc --noEmit`
- `bun run lint` — Biome
- `bun run build` — Node CLI bundle to `dist/cli.js`

## Layout

Nested by concern under `src/`. Outer modules depend on inner; never reverse:

`cli` → `hooks` / `mcp` / `hosts` / `reflection` / `search` → `store` → `cards`

Do not add a catch-all `utils.ts`. Paths live in `store/`; host completion lives in `reflection/complete/`.

## Cards

Durable facts at `~/.agents/muton/cards/<slug>.md`. Required frontmatter: `title`, `use_when`. System fields: `created_at`, `updated_at`. Body is the fact. Propose upserts: near-duplicate content updates the existing slug. No review gate.

## Hooks stay silent

Session-end reflection must not print proposals to the user. Detach, log under `~/.agents/muton/logs/` only.
