import type { CompleteRequest } from "./types.ts";

function isAnthropicModel(model: string): boolean {
  return /claude|anthropic/i.test(model);
}

/** Complete via HTTP using MUTON_MODEL + MUTON_API_KEY. */
export async function completeViaHttp(req: CompleteRequest): Promise<string> {
  const model = process.env.MUTON_MODEL;
  const apiKey = process.env.MUTON_API_KEY;
  if (!model || !apiKey) {
    throw new Error("MUTON_MODEL and MUTON_API_KEY are required for HTTP completion");
  }

  if (isAnthropicModel(model)) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("Anthropic response missing text");
    return text;
  }

  const base = process.env.MUTON_API_BASE ?? "https://api.openai.com/v1";
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI-compatible HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Chat completion missing content");
  return text;
}
