import { serializeCard } from "../../cards/index.ts";
import { CardStore } from "../../store/index.ts";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

/** Drop known flag pairs and boolean flags; remaining tokens are positionals. */
function positionals(args: string[], valueFlags: string[]): string[] {
  const skip = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") {
      skip.add(i);
      continue;
    }
    if (valueFlags.includes(args[i]!)) {
      skip.add(i);
      if (i + 1 < args.length) skip.add(i + 1);
    }
  }
  return args.filter((_, i) => !skip.has(i));
}

export function cmdShow(args: string[]): void {
  const json = args.includes("--json");
  const [slug] = positionals(args, []);
  if (!slug) {
    console.error("Usage: muton show [--json] <slug>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const card = store.read(slug);
    if (!card) {
      console.error(`Card not found: ${slug}`);
      process.exit(1);
    }
    if (json) {
      console.log(JSON.stringify(card));
      return;
    }
    console.log(serializeCard(card).trimEnd());
  } finally {
    store.close();
  }
}

export function cmdReplace(args: string[]): void {
  const json = args.includes("--json");
  const title = flag(args, "--title");
  const useWhen = flag(args, "--use-when");
  const body = flag(args, "--body");
  const [slug] = positionals(args, ["--title", "--use-when", "--body"]);
  if (!slug || (title === undefined && useWhen === undefined && body === undefined)) {
    console.error(
      "Usage: muton replace [--json] <slug> [--title <t>] [--use-when <u>] [--body <b>]",
    );
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const card = store.update(slug, {
      ...(title !== undefined ? { title } : {}),
      ...(useWhen !== undefined ? { use_when: useWhen } : {}),
      ...(body !== undefined ? { body } : {}),
    });
    if (json) {
      console.log(JSON.stringify(card));
      return;
    }
    console.log(`Replaced ${card.slug}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    store.close();
  }
}

export function cmdRm(args: string[]): void {
  const json = args.includes("--json");
  const [slug] = positionals(args, []);
  if (!slug) {
    console.error("Usage: muton rm [--json] <slug>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    store.delete(slug);
    if (json) {
      console.log(JSON.stringify({ slug, deleted: true }));
      return;
    }
    console.log(`Removed ${slug}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    store.close();
  }
}
