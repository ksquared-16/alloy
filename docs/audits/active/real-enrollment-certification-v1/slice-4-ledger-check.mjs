/** Proves the ledger covers every B fact exactly once, with a legal disposition. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEDGER, DISPOSITIONS } from "./slice-4-b-ledger.mjs";
import { CLASSIFICATION } from "./slice-3-classification.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
void fs;
void here;

const bFacts = Object.keys(CLASSIFICATION.B.keys).sort();
const ledgered = LEDGER.map((r) => r.concept).sort();

const missing = bFacts.filter((k) => !ledgered.includes(k));
const extra = ledgered.filter((k) => !bFacts.includes(k));
const dupes = ledgered.filter((k, i) => ledgered.indexOf(k) !== i);
const badDisposition = LEDGER.filter((r) => !DISPOSITIONS.includes(r.disposition));
const incomplete = LEDGER.filter((r) => !r.rationale || !r.grain || !r.existing_owner || !r.disposition || r.durable === undefined || !r.sensitivity);

const counts = {};
for (const r of LEDGER) counts[r.disposition] = (counts[r.disposition] ?? 0) + 1;

console.log("B facts:", bFacts.length, " ledger rows:", LEDGER.length);
for (const [d, n] of Object.entries(counts).sort()) console.log(`  ${String(n).padStart(2)}  ${d}`);
console.log("missing:", missing.length, missing);
console.log("not a B fact:", extra.length, extra);
console.log("duplicated:", dupes.length, dupes);
console.log("illegal disposition:", badDisposition.length, badDisposition.map((r) => r.disposition));
console.log("incomplete rows:", incomplete.length, incomplete.map((r) => r.concept));
if (missing.length || extra.length || dupes.length || badDisposition.length || incomplete.length) process.exit(1);
console.log("\nOK — every B fact has exactly one complete ledger row.");
