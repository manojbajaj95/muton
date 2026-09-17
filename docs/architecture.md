# Reflection architecture

Muton separates project knowledge from global runtime state.

```text
<project>/.agents/muton/
  cards/                 durable Markdown Cards
  index.sqlite           derived search index
  session-injected.json  per-session injection state

~/.agents/muton/
  transcripts/<project>/<session>/<sha256>.json
  runtime/jobs/<job-id>.json
  runtime/logs/reflection.jsonl
  runtime/scratch/<execution-id>/
```

The reflection pipeline is **ETLT+C**:

1. **Extract:** a host hook supplies its transcript path, project directory, host, and session id.
2. **Transform:** Muton parses complete host records and removes thinking and reasoning blocks, image payloads, transport events, timestamps, usage, cost, and other non-semantic metadata.
3. **Load:** Muton writes the bounded canonical transcript to an immutable, content-addressed global archive and creates an idempotent job. The hook does this before it returns.
4. **Transform:** an isolated one-shot host CLI or direct model reads only the canonical transcript and returns up to five proposals with evidence record ids.
5. **Commit:** Muton validates the whole output, merges complementary facts under a store write lock, and writes project-local Cards with source-session provenance.

The job id hashes project root, session id, and canonical transcript hash. Repeated shutdown events for the same transcript return the existing job. `muton reflect wait` waits for a specific session and can additionally select a transcript hash.

## Isolation

All reflection subprocesses receive `MUTON_REFLECTION_PROCESS=1`; every Muton hook exits immediately when that marker is present. Pi disables sessions, extensions, skills, context files, and tools. Claude disables tools, hooks, and session persistence. Codex uses an ephemeral execution with hooks, user configuration, and project rules disabled in a read-only sandbox. Cursor runs in ask mode with its sandbox and inherits the process marker.

No extractor resumes the task session. Host CLIs run from an empty global scratch directory; Muton reads project `REFLECTION.md` itself and includes the project root and source session in the extraction prompt. Sanitization changes the prompt, so a prior KV cache would not represent the extraction request.

## Backend selection

`MUTON_REFLECTION_BACKEND` selects an extractor:

- `codex`, `claude`, `cursor`, or `pi` use an installed host CLI
- `openai`, `anthropic`, or `openai-compatible` call an HTTP API directly

`MUTON_REFLECTION_MODEL` pins the model. Direct backends also require `MUTON_API_KEY`; an OpenAI-compatible service can use `MUTON_API_BASE`.
