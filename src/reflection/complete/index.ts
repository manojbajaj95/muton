import { completeViaHostCli } from "./host-cli.ts";
import { completeViaHttp } from "./http.ts";
import type { BackendSpec, Completer } from "./types.ts";

export type {
  BackendSpec,
  CompleteRequest,
  Completer,
  CompletionResult,
  CompletionUsage,
  HostName,
} from "./types.ts";

/** Bind a resolved backend to the common completion interface. */
export function createCompleter(backend: BackendSpec): Completer {
  return backend.kind === "direct"
    ? (req) => completeViaHttp(backend, req)
    : (req) => completeViaHostCli(backend, req);
}

export { buildHostCommand, completeViaHostCli } from "./host-cli.ts";
export { completeViaHttp } from "./http.ts";
export { parseBackendSpec, selectBackend } from "./select.ts";
