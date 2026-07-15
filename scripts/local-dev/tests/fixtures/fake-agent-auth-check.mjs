#!/usr/bin/env node
// Test fixture — never prints storage contents.
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

const { values } = parseArgs({
  options: {
    storage: { type: "string" },
    url: { type: "string" },
    "web-dir": { type: "string" },
  },
  strict: false,
});

const storage = values.storage;
if (!storage) {
  process.stdout.write("failed");
  process.exit(1);
}

try {
  const raw = readFileSync(storage, "utf8");
  if (raw.includes("EXPIRED")) process.stdout.write("login");
  else if (raw.includes("INVALID")) process.stdout.write("unauthorized");
  else if (raw.includes("cookies")) process.stdout.write("ok");
  else process.stdout.write("failed");
} catch {
  process.stdout.write("failed");
  process.exit(1);
}
