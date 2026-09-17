import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Card } from "../../cards/index.ts";
import { CardStore } from "../../store/index.ts";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 4377;

export function createViewServer(store = new CardStore()): Server {
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${HOST}`);

    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'",
    );
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    if (url.pathname !== "/") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(method === "HEAD" ? undefined : "Not found\n");
      return;
    }

    const cards = store
      .listCards()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.title.localeCompare(b.title));
    const html = renderViewPage(cards, url.searchParams.get("card") ?? undefined);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(method === "HEAD" ? undefined : html);
  });
  server.once("close", () => store.close());
  return server;
}

export async function cmdView(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: muton view [--port <number>]");
    return;
  }
  const port = parsePort(args);
  const server = createViewServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  console.log(`Viewing Muton Cards at http://${HOST}:${address.port}`);
  console.log("Press Ctrl+C to stop.");
}

function parsePort(args: string[]): number {
  if (args.length === 0) return DEFAULT_PORT;
  if (args.length !== 2 || args[0] !== "--port") {
    throw new Error("Usage: muton view [--port <number>]");
  }
  const port = Number(args[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Port must be an integer between 1 and 65535");
  }
  return port;
}

export function renderViewPage(cards: Card[], requestedSlug?: string): string {
  const selected = cards.find((card) => card.slug === requestedSlug) ?? cards[0];
  const countLabel = `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
  const cardItems = cards
    .map((card) => {
      const active = card.slug === selected?.slug;
      const searchText = `${card.title} ${card.use_when}`.toLowerCase();
      return `<li class="card-item" data-card-item data-search="${escapeHtml(searchText)}">
        <a class="card-link${active ? " active" : ""}" href="/?card=${encodeURIComponent(card.slug)}"${active ? ' aria-current="page"' : ""}>
          <strong>${escapeHtml(card.title)}</strong>
          <span>${escapeHtml(card.use_when)}</span>
        </a>
      </li>`;
    })
    .join("\n");

  const content = selected ? renderCard(selected) : renderEmptyState();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${selected ? `${escapeHtml(selected.title)} · ` : ""}Muton Cards</title>
  <style>
    :root {
      color-scheme: light;
      --lab: #f5f7f4;
      --paper: #ffffff;
      --ink: #17231b;
      --muton: #357a50;
      --rule: #cdd7cf;
      --quiet: #617067;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--lab);
      font-synthesis: none;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 18rem; background: var(--lab); }
    a { color: inherit; }
    button, input { font: inherit; }
    .shell { display: grid; grid-template-columns: minmax(17rem, 22rem) minmax(0, 1fr); min-height: 100vh; }
    .index {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      padding: 2rem 1.5rem;
      border-right: 1px solid var(--rule);
      background: var(--paper);
    }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
    .brand-name { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .78rem; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; }
    .count { color: var(--quiet); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .72rem; }
    .filter-label { display: block; margin-bottom: 1.5rem; }
    .filter-label span { display: block; margin-bottom: .45rem; color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .filter {
      width: 100%;
      padding: .7rem .8rem;
      border: 1px solid var(--rule);
      border-radius: .25rem;
      outline: none;
      color: var(--ink);
      background: var(--lab);
    }
    .filter:focus { border-color: var(--muton); box-shadow: 0 0 0 3px rgb(53 122 80 / 14%); }
    .card-list { display: grid; gap: .25rem; margin: 0; padding: 0; list-style: none; }
    .card-item[hidden] { display: none; }
    .card-link {
      position: relative;
      display: grid;
      gap: .35rem;
      padding: .85rem .9rem .85rem 1.25rem;
      border-radius: .3rem;
      text-decoration: none;
    }
    .card-link:hover { background: var(--lab); }
    .card-link:focus-visible { outline: 2px solid var(--muton); outline-offset: 2px; }
    .card-link strong { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-size: 1rem; line-height: 1.18; }
    .card-link span { display: -webkit-box; overflow: hidden; color: var(--quiet); font-size: .76rem; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .card-link.active { background: #eaf1eb; }
    .card-link.active::before {
      position: absolute;
      top: 1rem;
      left: .55rem;
      width: .3rem;
      height: .3rem;
      border-radius: 50%;
      background: var(--muton);
      box-shadow: 0 .48rem 0 var(--muton), 0 .96rem 0 var(--muton);
      content: "";
    }
    .no-results { margin: 1rem .9rem; color: var(--quiet); font-size: .82rem; }
    .main { min-width: 0; padding: clamp(2rem, 6vw, 5.5rem) clamp(1.5rem, 8vw, 8rem); }
    .card { width: min(48rem, 100%); margin: 0 auto; }
    .eyebrow { margin: 0 0 1rem; color: var(--muton); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .72rem; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
    h1 { max-width: 18ch; margin: 0; font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-size: clamp(2.25rem, 6vw, 4.75rem); font-weight: 600; letter-spacing: -.035em; line-height: .98; }
    .use-when { margin: 2rem 0 2.5rem; padding-left: 1rem; border-left: 3px solid var(--muton); }
    .use-when dt { margin-bottom: .35rem; color: var(--quiet); font-size: .7rem; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
    .use-when dd { margin: 0; font-size: 1rem; line-height: 1.6; }
    .card-body { margin: 0; padding: 2rem 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9rem; line-height: 1.72; overflow-wrap: anywhere; white-space: pre-wrap; }
    .meta { display: flex; flex-wrap: wrap; gap: .7rem 1.4rem; margin: 1.25rem 0 0; color: var(--quiet); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .7rem; }
    .sources { margin-top: 1rem; color: var(--quiet); font-size: .75rem; }
    .sources summary { cursor: pointer; }
    .sources ul { display: grid; gap: .55rem; margin: .75rem 0 0; padding-left: 1.2rem; }
    .sources code { overflow-wrap: anywhere; }
    .empty { width: min(38rem, 100%); margin: 12vh auto 0; }
    .empty h1 { font-size: clamp(2rem, 5vw, 3.6rem); }
    .empty p { max-width: 35rem; color: var(--quiet); line-height: 1.7; }
    @media (max-width: 720px) {
      .shell { display: block; }
      .index { position: static; height: auto; max-height: 48vh; border-right: 0; border-bottom: 1px solid var(--rule); }
      .main { padding-top: 3rem; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="index" aria-label="Card index">
      <header class="brand">
        <p class="brand-name">Muton / Card index</p>
        <span class="count">${countLabel}</span>
      </header>
      <label class="filter-label">
        <span>Filter cards</span>
        <input class="filter" type="search" placeholder="Title or use case" autocomplete="off" data-filter${cards.length === 0 ? " disabled" : ""}>
      </label>
      <ul class="card-list" data-card-list>${cardItems}</ul>
      <p class="no-results" data-no-results hidden>No cards match this filter.</p>
    </aside>
    <main class="main">${content}</main>
  </div>
  <script>
    const filter = document.querySelector("[data-filter]");
    const items = [...document.querySelectorAll("[data-card-item]")];
    const noResults = document.querySelector("[data-no-results]");
    filter?.addEventListener("input", () => {
      const query = filter.value.trim().toLowerCase();
      let visible = 0;
      for (const item of items) {
        item.hidden = !item.dataset.search.includes(query);
        if (!item.hidden) visible += 1;
      }
      noResults.hidden = visible !== 0;
    });
  </script>
</body>
</html>`;
}

function renderCard(card: Card): string {
  const sources = card.sources?.length
    ? `<details class="sources">
        <summary>${card.sources.length} source ${card.sources.length === 1 ? "session" : "sessions"}</summary>
        <ul>${card.sources
          .map(
            (source) =>
              `<li>Session <code>${escapeHtml(source.session_id)}</code> · Transcript <code>${escapeHtml(source.transcript_hash)}</code></li>`,
          )
          .join("")}</ul>
      </details>`
    : "";
  return `<article class="card">
      <p class="eyebrow">Durable project fact</p>
      <h1>${escapeHtml(card.title)}</h1>
      <dl class="use-when">
        <dt>Use when</dt>
        <dd>${escapeHtml(card.use_when)}</dd>
      </dl>
      <pre class="card-body">${escapeHtml(card.body)}</pre>
      <footer>
        <p class="meta">
          <span>slug: ${escapeHtml(card.slug)}</span>
          <span>created: ${formatDate(card.created_at)}</span>
          <span>updated: ${formatDate(card.updated_at)}</span>
        </p>
        ${sources}
      </footer>
    </article>`;
}

function renderEmptyState(): string {
  return `<section class="empty">
      <p class="eyebrow">No specimens yet</p>
      <h1>Your project has no Muton Cards.</h1>
      <p>Cards generated for this project will appear here after you refresh the page.</p>
    </section>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(
    new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date),
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}
