export type HostName = "claude" | "cursor" | "codex" | "pi";

export type BackendSpec =
  | { kind: "host"; host: HostName; model?: string }
  | {
      kind: "direct";
      provider: "anthropic" | "openai" | "openai-compatible";
      model: string;
      baseUrl?: string;
    };

export type CompletionUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type CompletionResult = {
  text: string;
  provider?: string;
  model?: string;
  usage?: CompletionUsage;
  costUsd?: number | null;
};

export type CompleteRequest = {
  system: string;
  user: string;
  cwd?: string;
  timeoutMs?: number;
};

export type Completer = (req: CompleteRequest) => Promise<CompletionResult>;
