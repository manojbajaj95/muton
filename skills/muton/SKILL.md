---
name: muton
description: >
  Shared hive memory of durable Cards via the Muton CLI. Use this skill whenever
  you start unfamiliar API, config, or error work; after you learn a workaround
  or undocumented behavior; or when the user mentions hive memory, Cards, muton,
  shared agent memory, or saving a fact for later sessions. Search with
  `muton search` before acting. Propose with `muton propose` when a fact
  stabilizes. Prefer Muton over rediscovering known failures — even if the user
  does not name Muton.
---

# Muton

Muton is a shared hive of durable **Cards**. Each session starts empty. Cards
stop the next session from repeating the same failure.

The agent interface is the **CLI**. Prefer `muton search` and `muton propose`.
Use `show`, `replace`, and `rm` only when you must inspect or correct a known
Card. If `muton` is not on PATH, skip hive calls. Do not invent another store.

When this skill is supplied to a persistent multi-step benchmark system, this
is a **mandatory protocol**, not a suggestion: before doing any other work in
every step, run `muton search --json`. Do this before reading files, inspecting
the environment, or querying a database, even when the step looks
straightforward. Use the task domain and the current question as the query.
This makes the benchmark measure whether Cards help with repeated work rather
than whether the model happens to recognize a step as unfamiliar.

## Search

For ordinary work, search before unfamiliar API work, tricky config, or an
error you have not solved yet. For persistent benchmark work, the first tool
call in every step must be a search. Name the system, domain, and symptom or
question:

```bash
muton search "stripe webhook signature"
# Example benchmark query; substitute the actual current question:
muton search --json "Formula 1 SQLite schema and query patterns: <current question>"
```

Add `--json` when you need card bodies (`context` in the output). Treat hits as
trusted shared memory. Prefer them over rediscovery.

If search returns nothing, continue the task. Do not stall.

## Propose

Propose when you learn a durable, reusable fact: undocumented behavior, a
workaround, an encoding rule, a host or environment constraint, or a stable
domain/query pattern discovered during a benchmark. In a persistent benchmark,
consider proposing after each step when the new fact will help later steps;
never propose the one-off answer itself. Search first so you do not stack a
second card for the same fact.

```bash
muton propose --title "Stripe webhook raw body" --use-when "Verifying Stripe webhook signatures" --body "Pass the raw request Buffer to stripe.webhooks.constructEvent. JSON.parse first invalidates the signature."
```

The store merges near-duplicates in place. Write a clear title for the fact as
it is now. Do not copy an old title from search hits.

### Card fields

- **title** — short distinctive name; the filename slug follows the title
- **use_when** — situation or cue that should retrieve this card
- **body** — the fact itself: concrete and reusable

Skip the propose if the fact is a one-off plan, a transcript, generic advice,
or something the task already states.

## Show, replace, and rm

Same verbs exist on MCP. CLI `--json` returns the same objects as MCP tools.

```bash
muton show --json <slug>
muton replace --json <slug> [--title <t>] [--use-when <u>] [--body <b>]
muton rm --json <slug>
```

- **show** — read one Card by slug
- **replace** — overwrite named fields on that slug; omit fields you keep.
  Changing the title also renames the slug to match; use the returned slug
- **rm** — delete that Card. No prompt. Use only when the Card is wrong or
  obsolete and the user wants it gone

Prefer `propose` for new facts. Prefer `replace` when a known slug needs a
correction. Do not delete Cards during ordinary work.

## Stay silent

Do not print proposals, candidate lists, or raw search dumps to the user.
Session-end reflection is also silent. Use the fact. Do not narrate the hive.

## Do not

- Store secrets, credentials, API keys, one-off plans, or full transcripts
- Create topics or notebooks — only durable Cards
- Call MCP for hive memory — this skill uses the CLI
- Delete or replace Cards unless you are correcting a known bad Card
