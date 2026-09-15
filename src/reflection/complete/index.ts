import { completeViaHostCli } from "./host-cli.ts";
import { completeViaHttp } from "./http.ts";
import type { CompleteRequest, Completer } from "./types.ts";

export type { CompleteRequest, Completer } from "./types.ts";

/** Prefer MUTON_MODEL+MUTON_API_KEY; else host CLI. */
export function createCompleter(): Completer {
  return async (req: CompleteRequest) => {
    if (process.env.MUTON_MODEL && process.env.MUTON_API_KEY) {
      return completeViaHttp(req);
    }
    return completeViaHostCli(req);
  };
}

export {
  buildHostCommand,
  completeViaHostCli,
  hostSupportsResume,
  usableSessionId,
} from "./host-cli.ts";
export { completeViaHttp } from "./http.ts";
