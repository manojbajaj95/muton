import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Card } from "../cards/index.ts";
import { searchCards } from "../search/index.ts";
import { CardStore, type UpsertResult } from "../store/index.ts";

export type ProposeResult = { action: UpsertResult["action"]; card: Card };
export type RmResult = { slug: string; deleted: true };

export function proposeCard(
  store: CardStore,
  input: { title: string; use_when: string; body: string },
): ProposeResult {
  const result = store.upsertDetailed(input);
  return { action: result.action, card: result.card };
}

export function showCard(store: CardStore, slug: string): Card {
  const card = store.read(slug);
  if (!card) throw new Error(`Card not found: ${slug}`);
  return card;
}

export function replaceCard(
  store: CardStore,
  input: { slug: string; title?: string; use_when?: string; body?: string },
): Card {
  const { slug, title, use_when, body } = input;
  if (title === undefined && use_when === undefined && body === undefined) {
    throw new Error("Update requires at least one field");
  }
  return store.update(slug, {
    ...(title !== undefined ? { title } : {}),
    ...(use_when !== undefined ? { use_when } : {}),
    ...(body !== undefined ? { body } : {}),
  });
}

export function rmCard(store: CardStore, slug: string): RmResult {
  store.delete(slug);
  return { slug, deleted: true };
}

function jsonText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export async function startMcpServer(home?: string): Promise<void> {
  const store = new CardStore(home);
  const server = new McpServer({ name: "muton", version: "0.1.0" });

  server.tool(
    "search",
    "Search durable Muton Cards in the shared hive before acting",
    { query: z.string().describe("Search query") },
    async ({ query }) => {
      const { hits, context } = searchCards(store, query, { k: 5 });
      return {
        content: [
          {
            type: "text" as const,
            text: context || JSON.stringify({ hits: hits.map((h) => h.title) }),
          },
        ],
      };
    },
  );

  server.tool(
    "propose",
    "Add a durable Card to the shared hive (near-duplicates merge in place)",
    {
      title: z.string(),
      use_when: z.string(),
      body: z.string(),
    },
    async ({ title, use_when, body }) => jsonText(proposeCard(store, { title, use_when, body })),
  );

  server.tool("show", "Read one Muton Card by slug", { slug: z.string() }, async ({ slug }) =>
    jsonText(showCard(store, slug)),
  );

  server.tool(
    "replace",
    "Replace named fields on a Muton Card by slug; omitted fields stay unchanged. Changing title also renames the slug",
    {
      slug: z.string(),
      title: z.string().optional(),
      use_when: z.string().optional(),
      body: z.string().optional(),
    },
    async (input) => jsonText(replaceCard(store, input)),
  );

  server.tool("rm", "Delete one Muton Card by slug", { slug: z.string() }, async ({ slug }) =>
    jsonText(rmCard(store, slug)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
