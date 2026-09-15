import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchCards } from "../search/index.ts";
import { CardStore } from "../store/index.ts";

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
    "Create or update a durable Card in the shared hive (near-duplicates update in place)",
    {
      title: z.string(),
      use_when: z.string(),
      body: z.string(),
    },
    async ({ title, use_when, body }) => {
      const card = store.upsert({ title, use_when, body });
      return {
        content: [{ type: "text" as const, text: `Stored card ${card.slug}` }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
