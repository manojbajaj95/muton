export type CompleteRequest = {
  system: string;
  user: string;
  host?: "claude" | "cursor" | "codex" | "pi" | "auto";
  cwd?: string;
  sessionId?: string;
};

export type Completer = (req: CompleteRequest) => Promise<string>;
