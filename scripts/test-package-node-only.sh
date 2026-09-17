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
  '
