import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdReplace, cmdRm, cmdShow } from "../../src/cli/commands/cards.ts";
import { cmdPropose } from "../../src/cli/commands/propose.ts";
import { CardStore } from "../../src/store/index.ts";

describe("card CLI CRUD", () => {
  const previousHome = process.env.MUTON_HOME;
  let home = "";
  const logs: string[] = [];
  const originalLog = console.log;

  afterEach(() => {
    console.log = originalLog;
    logs.length = 0;
    if (previousHome === undefined) delete process.env.MUTON_HOME;
    else process.env.MUTON_HOME = previousHome;
    if (home) rmSync(home, { recursive: true, force: true });
  });

  function withHome(): void {
    home = mkdtempSync(join(tmpdir(), "muton-cli-cards-"));
    process.env.MUTON_HOME = home;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
  }

  test("propose show replace rm share JSON shapes", () => {
    withHome();

    cmdPropose([
      "--json",
      "--title",
      "CLI Card",
      "--use-when",
      "Testing CLI",
      "--body",
      "Durable fact from CLI.",
    ]);
    const proposed = JSON.parse(logs[0]!);
    expect(proposed.action).toBe("created");
    expect(proposed.card.slug).toBe("cli-card");
    expect(proposed.card.body).toBe("Durable fact from CLI.");

    logs.length = 0;
    cmdShow(["--json", "cli-card"]);
    expect(JSON.parse(logs[0]!).slug).toBe("cli-card");

    logs.length = 0;
    cmdReplace(["--json", "cli-card", "--body", "Corrected fact."]);
    const replaced = JSON.parse(logs[0]!);
    expect(replaced.body).toBe("Corrected fact.");
    expect(replaced.use_when).toBe("Testing CLI");

    logs.length = 0;
    cmdReplace(["--json", "cli-card", "--title", "Renamed CLI Card"]);
    const renamed = JSON.parse(logs[0]!);
    expect(renamed.slug).toBe("renamed-cli-card");
    expect(renamed.title).toBe("Renamed CLI Card");

    logs.length = 0;
    cmdRm(["--json", "renamed-cli-card"]);
    expect(JSON.parse(logs[0]!)).toEqual({ slug: "renamed-cli-card", deleted: true });

    const store = new CardStore(home);
    try {
      expect(store.read("cli-card")).toBeNull();
      expect(store.read("renamed-cli-card")).toBeNull();
    } finally {
      store.close();
    }
  });

  test("propose text names the upsert action", () => {
    withHome();
    cmdPropose(["--title", "Text Card", "--use-when", "Text mode", "--body", "First write."]);
    expect(logs[0]).toBe("Wrote text-card");

    logs.length = 0;
    cmdPropose(["--title", "Text Card", "--use-when", "Text mode", "--body", "First write."]);
    expect(logs[0]).toBe("Unchanged text-card");
  });
});
