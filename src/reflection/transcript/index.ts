import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import type { CanonicalRecord, CanonicalRole, CanonicalTranscript } from "./canonical.ts";

const RAW_WINDOW_BYTES = 2_000_000;
const RAW_PREFIX_BYTES = 64_000;
const CANONICAL_MAX_CHARS = 120_000;

export type TranscriptHost = CanonicalTranscript["host"];

export type SanitizeTranscriptOptions = {
  path: string;
  host: TranscriptHost;
  sessionId: string;
  maxChars?: number;
};

type DraftRecord = Omit<CanonicalRecord, "id">;

/** Parse a host transcript into an immutable, metadata-free semantic transcript. */
export function sanitizeTranscript(opts: SanitizeTranscriptOptions): CanonicalTranscript {
  const raw = readBoundedTranscript(opts.path);
  const drafts = parseRecords(raw);
  const bounded = boundRecords(deduplicate(drafts), opts.maxChars ?? CANONICAL_MAX_CHARS);
  return {
    schema_version: 1,
    host: opts.host,
    session_id: opts.sessionId,
    records: bounded.map((record, index) => ({ ...record, id: `r${index + 1}` })),
  };
}

export function parseCanonicalTranscript(raw: string): CanonicalTranscript {
  const parsed = JSON.parse(raw) as CanonicalTranscript;
  if (
    parsed?.schema_version !== 1 ||
    !parsed.host ||
    typeof parsed.session_id !== "string" ||
    !Array.isArray(parsed.records)
  ) {
    throw new Error("Invalid canonical transcript");
  }
  return parsed;
}

export function serializeCanonicalTranscript(transcript: CanonicalTranscript): string {
  return `${JSON.stringify(transcript)}\n`;
}

function readBoundedTranscript(path: string): string {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    if (size <= RAW_WINDOW_BYTES) return readFileSync(fd, "utf8");

    const prefix = Buffer.alloc(RAW_PREFIX_BYTES);
    readSync(fd, prefix, 0, prefix.length, 0);
    const suffixLength = RAW_WINDOW_BYTES - RAW_PREFIX_BYTES;
    const suffix = Buffer.alloc(suffixLength);
    readSync(fd, suffix, 0, suffix.length, size - suffix.length);

    const prefixText = prefix.toString("utf8");
    const prefixEnd = prefixText.lastIndexOf("\n");
    const suffixText = suffix.toString("utf8");
    const suffixStart = suffixText.indexOf("\n");
    return `${prefixText.slice(0, Math.max(0, prefixEnd))}\n${suffixText.slice(suffixStart + 1)}`;
  } finally {
    closeSync(fd);
  }
}

function parseRecords(raw: string): DraftRecord[] {
  const records: DraftRecord[] = [];
  let parsedLines = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as unknown;
      parsedLines += 1;
      records.push(...recordsFromValue(value));
    } catch {
      // A bounded suffix may begin after a partial line. Complete non-JSON lines are ignored.
    }
  }

  if (parsedLines === 0 && raw.trim()) {
    return [{ role: "user", text: raw.trim() }];
  }
  return records;
}

function recordsFromValue(value: unknown): DraftRecord[] {
  if (!isRecord(value)) return [];
  const eventType = string(value.type)?.toLowerCase() ?? "";
  if (/update|delta|usage|thinking|reasoning/.test(eventType)) return [];

  if (eventType === "response_item" && isRecord(value.payload)) {
    return recordsFromValue(value.payload);
  }

  if (eventType === "tool_execution_end") {
    const text = textFromContent(value.result);
    if (!text) return [];
    return [
      {
        role: "tool",
        name: string(value.toolName) ?? "tool",
        input: cleanValue(value.args),
        text,
        is_error: value.isError === true,
      },
    ];
  }

  if (eventType === "function_call_output" || eventType === "custom_tool_call_output") {
    const text = textFromContent(value.output ?? value.content);
    return text ? [{ role: "tool", name: "tool", text }] : [];
  }

  const message = isRecord(value.message)
    ? value.message
    : eventType === "message" || "role" in value
      ? value
      : undefined;
  if (message) {
    return recordsFromMessage(
      !message.role && typeof value.role === "string" ? { ...message, role: value.role } : message,
    );
  }

  return [];
}

function recordsFromMessage(message: Record<string, unknown>): DraftRecord[] {
  const rawRole = string(message.role)?.toLowerCase();
  const role: CanonicalRole | undefined =
    rawRole === "assistant"
      ? "assistant"
      : rawRole === "toolresult" || rawRole === "tool"
        ? "tool"
        : rawRole === "user" || rawRole === "developer" || rawRole === "system"
          ? "user"
          : undefined;
  if (!role) return [];
  const content = message.content ?? message.text ?? message.output;
  const toolResults = toolResultsFromContent(content);
  const text = textFromContent(content);
  if (role === "tool") {
    return text
      ? [
          {
            role,
            name: string(message.toolName) ?? string(message.name) ?? "tool",
            text,
            is_error: message.isError === true,
          },
        ]
      : [];
  }
  return [...(text ? [{ role, text } as DraftRecord] : []), ...toolResults];
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    if (content.trimStart().startsWith("data:image/")) return "";
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .flatMap((part) => {
        if (typeof part === "string") return [part];
        if (!isRecord(part)) return [];
        const type = string(part.type)?.toLowerCase() ?? "";
        if (/thinking|reasoning|image|signature|toolcall|tool_use|tool_result/.test(type))
          return [];
        const text = string(part.text) ?? string(part.output_text) ?? string(part.input_text);
        return text ? [text] : [];
      })
      .join("\n")
      .trim();
  }
  if (isRecord(content)) {
    return textFromContent(content.content ?? content.text ?? content.output);
  }
  return "";
}

function toolResultsFromContent(content: unknown): DraftRecord[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!isRecord(part) || string(part.type)?.toLowerCase() !== "tool_result") return [];
    const text = textFromContent(part.content ?? part.text ?? part.output);
    if (!text) return [];
    return [
      {
        role: "tool" as const,
        name: string(part.name) ?? string(part.tool_name) ?? "tool",
        text,
        is_error: part.is_error === true,
      },
    ];
  });
}

function cleanValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || value.length > 10_000) return undefined;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => cleanValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(id|timestamp|usage|cost|duration|signature|image|data)$/i.test(key)) continue;
    const cleaned = cleanValue(item, depth + 1);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function deduplicate(records: DraftRecord[]): DraftRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.role}\0${record.name ?? ""}\0${record.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boundRecords(records: DraftRecord[], maxChars: number): DraftRecord[] {
  if (records.length === 0) return [];
  const firstUser = records.find(
    (record) => record.role === "user" && JSON.stringify(record).length <= maxChars,
  );
  const selected: DraftRecord[] = [];
  let used = firstUser ? JSON.stringify(firstUser).length : 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index]!;
    if (record === firstUser) continue;
    const size = JSON.stringify(record).length;
    if (used + size > maxChars) continue;
    selected.push(record);
    used += size;
  }
  selected.reverse();
  return firstUser ? [firstUser, ...selected] : selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export type { CanonicalRecord, CanonicalTranscript } from "./canonical.ts";
