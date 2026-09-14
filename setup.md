# Setup notes

## Done

- Bun TypeScript package `muton` with nested `src/` by concern
- Biome lint/format
- MIT license, CITATION.cff, README, AGENTS.md, CONTRIBUTING.md
- Pre-commit (Biome)
- GitHub CI (lint, typecheck, test)
- release-please + npm trusted publishing workflow (OIDC, no NPM_TOKEN)
- Cards store under `~/.agents/muton`, FTS5 BM25 search
- Silent session-end reflection via host CLI or `MUTON_*` override
- Hooks for Cursor, Claude, Codex, Pi + `muton install`
- MCP (`search`, `propose`) and Skill + CLI fallback

## Skipped

- Superpowers / Matt Pocock / Addy Osmani skill packs (ask if wanted)
- Branch protection (configure on GitHub when ready)
- Semantic / embedding search (later version)
- Remote commons, PII service, management UI
- Card versioning, merge, deletion, confirm/flag
