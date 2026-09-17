import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Card } from "../../src/cards/index.ts";
import { createViewServer, renderViewPage } from "../../src/cli/commands/view.ts";
import { CardStore } from "../../src/store/index.ts";

const cards: Card[] = [
  {
    slug: "safe-card",
    title: "Safe <script>alert(1)</script>",
    use_when: "Viewing & testing",
    body: "Keep **Markdown** readable.\n\n<script>alert('no')</script>",
    created_at: "2026-09-17T08:00:00.000Z",
    updated_at: "2026-09-17T09:00:00.000Z",
  },
  {
    slug: "other-card",
    title: "Other Card",
    use_when: "Selecting another card",
    body: "Another durable fact.",
    created_at: "2026-09-16T08:00:00.000Z",
    updated_at: "2026-09-16T09:00:00.000Z",
  },
];

describe("Card viewer", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  test("renders the Card index, selection, and escaped content", () => {
    const html = renderViewPage(cards, "other-card");

    expect(html).toContain("2 cards");
    expect(html).toContain('href="/?card=other-card" aria-current="page"');
    expect(html).toContain("Safe &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert('no')</script>");
  });

  test("serves Cards from the project store", async () => {
    const root = mkdtempSync(join(tmpdir(), "muton-view-"));
    roots.push(root);
    const store = new CardStore(root);
    store.writeNew({ title: "Served Card", use_when: "Testing the viewer", body: "Visible fact" });
    const server = createViewServer(store);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Served Card");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("shows a useful empty state", () => {
    expect(renderViewPage([])).toContain("Your project has no Muton Cards.");
  });
});
