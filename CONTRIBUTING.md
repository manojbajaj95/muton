# Contributing

## Setup

```bash
bun install
bun test
bun run lint
bun run typecheck
```

Install pre-commit hooks after cloning:

```bash
pre-commit install
```

## Pull requests

Open a pull request against `main`. Direct pushes are blocked except for maintainers. CI must pass, including a CLI build check.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, and so on.

## Principles

Keep modules deep and boundaries clear. Prefer the standard library and trusted packages over custom code. Implement only what the task needs (YAGNI).
