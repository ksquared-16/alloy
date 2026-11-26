#!/usr/bin/env node
// Test fixture — simulates login capture without a real browser.
import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    "login-route": { type: "string" },
    "check-route": { type: "string" },
    "profile-dir": { type: "string" },
    "storage-out": { type: "string" },
    "pid-out": { type: "string" },
    "web-dir": { type: "string" },
    fail: { type: "string" },
  },
  strict: false,
});

if (values.fail === "1") {
  console.error("error: simulated login failure");
  process.exit(1);
}

const storage = values["storage-out"];
const pidOut = values["pid-out"];
const profile = values["profile-dir"];
if (!storage) process.exit(2);

await mkdir(dirname(storage), { recursive: true });
if (profile) await mkdir(profile, { recursive: true });
await writeFile(
  storage,
  '{"cookies":[{"name":"sb-test","value":"redacted"}],"origins":[]}',
  { mode: 0o600 }
);
if (pidOut) {
  await writeFile(pidOut, String(process.pid), { mode: 0o600 });
}
console.log(`storage-state saved: ${storage}`);
