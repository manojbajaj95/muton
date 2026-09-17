export type CanonicalRole = "user" | "assistant" | "tool";

export type CanonicalRecord = {
  id: string;
  role: CanonicalRole;
  text: string;
  name?: string;
  input?: unknown;
  is_error?: boolean;
};

export type CanonicalTranscript = {
  schema_version: 1;
  host: "claude" | "cursor" | "codex" | "pi";
  session_id: string;
  records: CanonicalRecord[];
};
