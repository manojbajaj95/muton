import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proposeCard, replaceCard, rmCard, showCard, startMcpServer } from "../../src/mcp/index.ts";
import { CardStore } from "../../src/store/index.ts";

describe("mcp", () => {
  let home = "";
  let store: CardStore | undefined;

  afterEach(() => {
    store?.close();
    if (home) rmSync(home, { recursive: true, force: true });
  });

  test("module loads", async () => {
    expect(typeof startMcpServer).toBe("function");
  });

  test("propose show replace rm return shared JSON shapes", () => {
    home = mkdtempSync(join(tmpdir(), "muton-mcp-cards-"));
    store = new CardStore(home);

    const proposed = proposeCard(store, {
      title: "MCP Card",
      use_when: "Testing MCP",
      body: "Durable fact from MCP.",
    });
    expect(proposed.action).toBe("created");
    expect(proposed.card.slug).toBe("mcp-card");

    expect(showCard(store, "mcp-card").body).toBe("Durable fact from MCP.");

    const replaced = replaceCard(store, { slug: "mcp-card", body: "Corrected MCP fact." });
    expect(replaced.body).toBe("Corrected MCP fact.");
    expect(replaced.use_when).toBe("Testing MCP");

    expect(rmCard(store, "mcp-card")).toEqual({ slug: "mcp-card", deleted: true });
    expect(() => showCard(store!, "mcp-card")).toThrow("Card not found: mcp-card");
  });
});
