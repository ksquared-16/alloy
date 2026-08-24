/** Proves every unbound fact lands in EXACTLY one bucket — none missed, none counted twice. */
import { FACTS } from "./packet-inventory.mjs";
import { CLASSIFICATION } from "./unbound-fact-classification.mjs";

const unbound = FACTS.filter((f) => f.canon === "no").map((f) => f.id);
const placed = [];
for (const [key, bucket] of Object.entries(CLASSIFICATION)) for (const id of Object.keys(bucket.facts)) placed.push({ id, key });

const byId = new Map();
for (const p of placed) byId.set(p.id, [...(byId.get(p.id) ?? []), p.key]);

const missing = unbound.filter((id) => !byId.has(id));
const duplicated = [...byId.entries()].filter(([, ks]) => ks.length > 1);
const unknown = placed.filter((p) => !unbound.includes(p.id));

console.log("unbound facts:", unbound.length);
console.log("classified:   ", placed.length);
for (const [key, b] of Object.entries(CLASSIFICATION)) console.log(`  ${key}  ${String(Object.keys(b.facts).length).padStart(2)}  ${b.title}`);
console.log("missing:", missing.length, missing);
console.log("in two buckets:", duplicated.length, duplicated);
console.log("classified but not unbound:", unknown.length, unknown);
if (missing.length || duplicated.length || unknown.length) process.exit(1);
console.log("\nOK — every unbound fact is in exactly one bucket.");
