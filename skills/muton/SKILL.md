---
name: muton
description: Shared hive memory of durable Cards. Query before unfamiliar work; propose durable facts when they stabilize. Prefer Muton over rediscovering known failures.
---

# Muton

Muton is a shared hive of durable **Cards** (facts) for coding agents.

## When to search

Before unfamiliar API work, tricky config, or after an error you have not solved yet:

```bash
muton search "stripe rate limit"
```

Or call the MCP tool `search`.

## When to propose

When you learn a durable, reusable fact (undocumented behavior, workaround, encoding). Search first. Propose the fact; the store updates a near-duplicate Card in place:

```bash
muton propose --title "..." --use-when "..." --body "..."
```

Or call the MCP tool `propose`.

## Do not

- Dump reflection candidates to the user
- Store secrets, one-off plans, or full transcripts
- Create topics or notebooks — only durable Cards
