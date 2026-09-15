import { CardStore } from "../../store/index.ts";

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

export function cmdPropose(args: string[]): void {
  const title = flag(args, "--title");
  const useWhen = flag(args, "--use-when");
  const body = flag(args, "--body");
  if (!title || !useWhen || !body) {
    console.error("Usage: muton propose --title <t> --use-when <u> --body <b>");
    process.exit(1);
  }
  const store = new CardStore();
  try {
    const card = store.upsert({ title, use_when: useWhen, body });
    console.log(`Wrote ${card.slug}`);
  } finally {
    store.close();
  }
}
