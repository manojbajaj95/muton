import type { BackendSpec, HostName } from "./types.ts";

export function selectBackend(sourceHost?: HostName, requestedModel?: string): BackendSpec {
  const configured = process.env.MUTON_REFLECTION_BACKEND?.trim();
  const model =
    requestedModel?.trim() ||
    process.env.MUTON_REFLECTION_MODEL?.trim() ||
    process.env.MUTON_MODEL?.trim();
  if (configured) return parseBackendSpec(configured, model);

  if (process.env.MUTON_MODEL && process.env.MUTON_API_KEY) {
    return {
      kind: "direct",
      provider: /claude|anthropic/i.test(process.env.MUTON_MODEL) ? "anthropic" : "openai",
      model: process.env.MUTON_MODEL,
      baseUrl: process.env.MUTON_API_BASE,
    };
  }

  if (sourceHost) return { kind: "host", host: sourceHost, model };
  return { kind: "host", host: "codex", model };
}

export function parseBackendSpec(value: string, model?: string): BackendSpec {
  const normalized = isHostName(value)
    ? `host:${value}`
    : isDirectProvider(value)
      ? `direct:${value}`
      : value;
  const [kind, name] = normalized.split(":", 2);
  if (kind === "host" && isHostName(name)) return { kind, host: name, model };
  if (kind === "direct" && isDirectProvider(name)) {
    if (!model) throw new Error("A model is required for a direct backend");
    return { kind, provider: name, model, baseUrl: process.env.MUTON_API_BASE };
  }
  throw new Error(
    `Invalid reflection backend: ${value}. Use codex, claude, cursor, pi, openai, anthropic, or openai-compatible`,
  );
}

function isHostName(value?: string): value is HostName {
  return value === "codex" || value === "claude" || value === "cursor" || value === "pi";
}

function isDirectProvider(value?: string): value is "anthropic" | "openai" | "openai-compatible" {
  return value === "anthropic" || value === "openai" || value === "openai-compatible";
}
