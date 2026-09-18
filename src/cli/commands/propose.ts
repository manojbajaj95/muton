import { CardStore } from "../../store/index.ts";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

export function cmdPropose(args: string[]): void {
  const json = args.includes("--json");
  const title = flag(args, "--title");
  const useWhen = flag(args, "--use-when");
  const body = flag(args, "--body");
  if (!title || !useWhen || !body) {
    console.error("Usage: muton propose [--json] --title <t> --use-when <u> --body <b>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const result = store.upsertDetailed({ title, use_when: useWhen, body });
    if (json) {
      console.log(JSON.stringify({ action: result.action, card: result.card }));
      return;
    }
    const label =
      result.action === "created" ? "Wrote" : result.action === "merged" ? "Merged" : "Unchanged";
    console.log(`${label} ${result.card.slug}`);
  } finally {
    store.close();
  }
}
