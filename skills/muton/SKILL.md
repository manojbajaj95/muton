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

The agent interface is the **CLI**. Use `muton search` and `muton propose`. If
`muton` is not on PATH, skip hive calls. Do not invent another store.

## Search

Search before unfamiliar API work, tricky config, or an error you have not
solved yet. Name the system and the symptom:

```bash
muton search "stripe webhook signature"
```

Add `--json` when you need card bodies (`context` in the output). Treat hits as
trusted shared memory. Prefer them over rediscovery.

If search returns nothing, continue the task. Do not stall.

## Propose

Propose when you learn a durable, reusable fact: undocumented behavior, a
workaround, an encoding rule, a host or environment constraint. Search first so
you do not stack a second card for the same fact.

```bash
muton propose --title "Stripe webhook raw body" --use-when "Verifying Stripe webhook signatures" --body "Pass the raw request Buffer to stripe.webhooks.constructEvent. JSON.parse first invalidates the signature."
```

The store updates a near-duplicate Card in place. Write a clear title for the
fact as it is now. Do not copy an old title from search hits.

### Card fields

- **title** — short distinctive name (also becomes the filename slug)
- **use_when** — situation or cue that should retrieve this card
- **body** — the fact itself: concrete and reusable

Skip the propose if the fact is a one-off plan, a transcript, generic advice,
or something the task already states.

## Stay silent

Do not print proposals, candidate lists, or raw search dumps to the user.
Session-end reflection is also silent. Use the fact. Do not narrate the hive.

## Do not

- Store secrets, credentials, API keys, one-off plans, or full transcripts
- Create topics or notebooks — only durable Cards
- Call MCP for hive memory — this skill uses the CLI
