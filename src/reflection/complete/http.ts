import type { BackendSpec, CompleteRequest, CompletionResult } from "./types.ts";

export async function completeViaHttp(
  backend: Extract<BackendSpec, { kind: "direct" }>,
  req: CompleteRequest,
): Promise<CompletionResult> {
  const apiKey = process.env.MUTON_API_KEY;
  if (!apiKey) throw new Error("MUTON_API_KEY is required for direct reflection");
  const signal = AbortSignal.timeout(req.timeoutMs ?? 120_000);

  if (backend.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: backend.model,
        max_tokens: 4096,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      }),
    });
    if (!response.ok)
      throw new Error(`Anthropic HTTP ${response.status}: ${await response.text()}`);
    const data = (await response.json()) as Record<string, unknown>;
    const content = Array.isArray(data.content) ? data.content : [];
    const text = content.filter(isRecord).find((part) => part.type === "text")?.text;
    if (typeof text !== "string") throw new Error("Anthropic response missing text");
    const usage = isRecord(data.usage) ? data.usage : {};
    return {
      text,
      provider: "anthropic",
      model: typeof data.model === "string" ? data.model : backend.model,
      usage: {
        inputTokens: numeric(usage.input_tokens),
        outputTokens: numeric(usage.output_tokens),
        cacheReadTokens: numeric(usage.cache_read_input_tokens),
        cacheWriteTokens: numeric(usage.cache_creation_input_tokens),
      },
      costUsd: null,
    };
  }

  const base = backend.baseUrl ?? "https://api.openai.com/v1";
  const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: backend.model,
      ...(backend.provider === "openai" ? { max_completion_tokens: 4096 } : { max_tokens: 4096 }),
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(`OpenAI-compatible HTTP ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices.find(isRecord);
  const message = first && isRecord(first.message) ? first.message : undefined;
  if (typeof message?.content !== "string") throw new Error("Chat completion missing content");
  const usage = isRecord(data.usage) ? data.usage : {};
  return {
    text: message.content,
    provider: backend.provider,
    model: typeof data.model === "string" ? data.model : backend.model,
    usage: {
      inputTokens: numeric(usage.prompt_tokens),
      outputTokens: numeric(usage.completion_tokens),
      cacheReadTokens: isRecord(usage.prompt_tokens_details)
        ? numeric(usage.prompt_tokens_details.cached_tokens)
        : undefined,
    },
    costUsd: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
