import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { z } from "zod";
import {
  mutonHome,
  reflectionScratchDir,
  projectRoot as resolveProjectRoot,
  runtimeHome,
} from "../store/fs.ts";
import { CardStore } from "../store/index.ts";
import {
  type BackendSpec,
  type Completer,
  type CompletionResult,
  createCompleter,
  selectBackend,
} from "./complete/index.ts";
import { loadReflectionPrompt } from "./prompt.ts";
import {
  type CanonicalTranscript,
  sanitizeTranscript,
  serializeCanonicalTranscript,
} from "./transcript/index.ts";
import { writeProposedCards } from "./writer.ts";

const ProposalSchema = z
  .object({
    title: z.string().trim().min(1),
    use_when: z.string().trim().min(1),
    body: z.string().trim().min(1),
    evidence: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();
const ProposalArraySchema = z.array(ProposalSchema).max(5);

export type ReflectionProposal = z.infer<typeof ProposalSchema>;

export type ReflectOptions = {
  transcriptPath: string;
  cwd?: string;
  home?: string;
  runtimeHome?: string;
  host?: "claude" | "cursor" | "codex" | "pi";
  sessionId?: string;
  backend?: BackendSpec;
  completer?: Completer;
};

export type ReflectCanonicalOptions = {
  transcript: CanonicalTranscript;
  transcriptHash?: string;
  projectRoot: string;
  cardHome: string;
  runtimeHome?: string;
  backend?: BackendSpec;
  completer?: Completer;
};

export type ReflectResult = {
  written: number;
  skipped: number;
  created: number;
  merged: number;
  equivalent: number;
  completion?: CompletionResult;
};

export class ReflectionOutputError extends Error {
  readonly reasons: string[];

  constructor(message: string, reasons: string[] = []) {
    super(message);
    this.name = "ReflectionOutputError";
    this.reasons = reasons;
  }
}

/** Extract, sanitize, and reflect without resuming the originating host session. */
export async function reflect(opts: ReflectOptions): Promise<ReflectResult> {
  const host = opts.host ?? "codex";
  const sessionId = opts.sessionId && opts.sessionId !== "unknown" ? opts.sessionId : "manual";
  const root = resolveProjectRoot(opts.cwd);
  const transcript = sanitizeTranscript({ path: opts.transcriptPath, host, sessionId });
  const serialized = serializeCanonicalTranscript(transcript);
  return reflectCanonical({
    transcript,
    transcriptHash: createHash("sha256").update(serialized).digest("hex"),
    projectRoot: root,
    cardHome: opts.home ?? mutonHome(undefined, root),
    runtimeHome: opts.runtimeHome,
    backend: opts.backend ?? selectBackend(opts.host),
    completer: opts.completer,
  });
}

/** Transform a canonical transcript into validated, provenance-carrying Cards. */
export async function reflectCanonical(opts: ReflectCanonicalOptions): Promise<ReflectResult> {
  if (opts.transcript.records.length === 0) return emptyResult();

  const store = new CardStore(opts.cardHome);
  try {
    const backend = opts.backend ?? selectBackend(opts.transcript.host);
    const complete = opts.completer ?? createCompleter(backend);
    const globalHome = opts.runtimeHome ?? runtimeHome();
    const executionKey = createHash("sha256")
      .update(`${opts.projectRoot}\0${opts.transcript.session_id}`)
      .digest("hex")
      .slice(0, 24);
    const executionCwd = reflectionScratchDir(executionKey, globalHome);
    mkdirSync(executionCwd, { recursive: true, mode: 0o700 });
    try {
      chmodSync(executionCwd, 0o700);
    } catch {
      // Best effort on filesystems without POSIX modes.
    }
    const completion = await complete({
      system: `${loadReflectionPrompt({
        cwd: opts.projectRoot,
        home: store.home,
        runtimeHome: globalHome,
      })}\n\nProject root: ${opts.projectRoot}\nSource session: ${opts.transcript.session_id}`,
      user: serializeCanonicalTranscript(opts.transcript),
      cwd: executionCwd,
    });
    const proposals = parseProposals(completion.text, opts.transcript);
    const source = {
      session_id: opts.transcript.session_id,
      transcript_hash:
        opts.transcriptHash ??
        createHash("sha256").update(serializeCanonicalTranscript(opts.transcript)).digest("hex"),
    };
    const result = writeProposedCards(
      store,
      proposals.map(({ evidence: _evidence, ...proposal }) => ({ ...proposal, sources: [source] })),
    );
    return {
      written: result.created.length + result.merged.length,
      skipped: result.equivalent.length,
      created: result.created.length,
      merged: result.merged.length,
      equivalent: result.equivalent.length,
      completion,
    };
  } finally {
    store.close();
  }
}

export function parseProposals(raw: string, transcript: CanonicalTranscript): ReflectionProposal[] {
  let value: unknown;
  try {
    value = JSON.parse(raw.trim());
  } catch (error) {
    throw new ReflectionOutputError("Reflection output is not valid JSON", [String(error)]);
  }

  const result = ProposalArraySchema.safeParse(value);
  if (!result.success) {
    const reasons = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
    );
    throw new ReflectionOutputError("Reflection output violates the proposal contract", reasons);
  }

  const records = new Map(transcript.records.map((record) => [record.id, record]));
  const evidenceErrors: string[] = [];
  for (const [index, proposal] of result.data.entries()) {
    for (const id of proposal.evidence) {
      if (!records.has(id)) evidenceErrors.push(`${index}.evidence: unknown record ${id}`);
    }
    if (!proposal.evidence.some((id) => records.get(id)?.role !== "user")) {
      evidenceErrors.push(`${index}.evidence: at least one assistant or tool record is required`);
    }
  }
  if (evidenceErrors.length) {
    throw new ReflectionOutputError("Reflection evidence is invalid", evidenceErrors);
  }
  return result.data;
}

function emptyResult(): ReflectResult {
  return { written: 0, skipped: 0, created: 0, merged: 0, equivalent: 0 };
}

export { createCompleter, selectBackend } from "./complete/index.ts";
export { loadReflectionPrompt } from "./prompt.ts";
export { writeProposedCards } from "./writer.ts";
