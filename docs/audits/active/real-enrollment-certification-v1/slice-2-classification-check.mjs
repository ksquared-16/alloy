/** Proves the Slice-2 classification partitions the MEASURED unbound keys exactly. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSIFICATION } from "./slice-2-classification.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const measured = fs
    .readFileSync(path.join(here, "slice-2-unbound-keys.txt"), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const placed = [];
for (const [bucket, b] of Object.entries(CLASSIFICATION)) for (const k of Object.keys(b.keys)) placed.push({ k, bucket });

const byKey = new Map();
for (const p of placed) byKey.set(p.k, [...(byKey.get(p.k) ?? []), p.bucket]);

const missing = measured.filter((k) => !byKey.has(k));
const duplicated = [...byKey.entries()].filter(([, v]) => v.length > 1);
const unknown = placed.filter((p) => !measured.includes(p.k));

console.log("measured unbound facts:", measured.length);
console.log("classified:           ", placed.length);
for (const [k, b] of Object.entries(CLASSIFICATION)) console.log(`  ${k}  ${String(Object.keys(b.keys).length).padStart(2)}  ${b.title}`);
console.log("missing:", missing.length, missing);
console.log("in two buckets:", duplicated.length, duplicated);
console.log("classified but not measured:", unknown.length, unknown.map((u) => u.k));
if (missing.length || duplicated.length || unknown.length) process.exit(1);
console.log("\nOK — every measured unbound fact is in exactly one bucket.");
