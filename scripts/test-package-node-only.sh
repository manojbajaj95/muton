#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
package="$(cd "$repo" && npm_config_cache="${TMPDIR:-/tmp}/muton-npm-cache" npm pack --silent)"
cleanup() { rm -f "$repo/$package"; }
trap cleanup EXIT

docker run --rm \
  -v "$repo/$package:/tmp/muton.tgz:ro" \
  node:22-bookworm-slim \
  sh -eu -c '
    npm install -g /tmp/muton.tgz >/dev/null
    mkdir -p /tmp/project && cd /tmp/project
    muton install --target claude >/dev/null
    muton propose --title "Packaged CLI" --use-when "testing npm artifact" --body "The Node bundle executes without Bun." >/dev/null
    muton search "Packaged CLI" | grep -q "Packaged CLI"
    muton view --port 4377 >/tmp/muton-view.log 2>&1 &
    viewer_pid=$!
    trap '\''kill "$viewer_pid" 2>/dev/null || true'\'' EXIT
    node -e '\''
      const url = "http://127.0.0.1:4377";
      let lastError;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const response = await fetch(url);
          const html = await response.text();
          if (response.ok && html.includes("Packaged CLI")) process.exit(0);
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw lastError ?? new Error("Packaged viewer did not return its Card");
    '\''
    kill "$viewer_pid"
    wait "$viewer_pid" 2>/dev/null || true
    trap - EXIT
  '
