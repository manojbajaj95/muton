import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const path = "dist/cli.js";
const bundle = readFileSync(path, "utf8").replace(/^#![^\r\n]*(?:\r?\n|$)/, "");
writeFileSync(path, `#!/usr/bin/env node\n${bundle}`);
chmodSync(path, 0o755);
