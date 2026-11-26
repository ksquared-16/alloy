/**
 * Slice 1 deliverable §8 — section-level participant workload.
 *
 * The packet's nine deterministic sections, with the enriched understanding applied. This is
 * EVIDENCE for later conversation planning, not a conversation plan: no multi-need packaging is
 * implemented, and the deterministic runtime remains authority over every need.
 *
 * "Already known" and "confirm" are equal by design. A fact Alloy holds is always confirmed once
 * before it is reused — it is never assumed. Keeping both columns makes that visible rather than
 * implied.
 */
import { FACTS } from "./packet-inventory.mjs";
import { CLASSIFICATION } from "./unbound-fact-classification.mjs";

const bucketOf = (id) => Object.entries(CLASSIFICATION).find(([, b]) => id in b.facts)?.[0] ?? null;

const SECTION = (f) => {
    const id = f.id;
    if (f.ack || f.signature) return "10 · Review & sign";
    if (id.startsWith("imm.")) return "05 · Immunization record";
    if (id.startsWith("bank.") || id.startsWith("account_holder")) return "09 · Tuition & payment";
    if (id.startsWith("ec")) return "03 · Emergency contacts & authorized adults";
    if (/custody|restraining/.test(id)) return "08 · Custody & legal";
    if (id.startsWith("guardian") || /household\.(primary|secondary)_address|pickup_notes/.test(id)) return "02 · Family & contact information";
    if (/physician|dentist|allergies|medications|general_health|birth_complications|serious_illness|insect_sting|accommodations|developmental_history|therapy_history|sibling/.test(id)) return "04 · Health & medical";
    if (/eating|diet|foods|toilet|nap|bedtime|wake_time/.test(id)) return "06 · Daily routines";
    if (/social|prior_care|concurrent|strangers|plays_alone|favorite_activities|fears|comfort|anger|behavior_management|personality|enrollment_goals|additional_notes/.test(id)) return "07 · Getting to know your child";
    if (id.startsWith("org.") || id.startsWith("sys.")) return "00 · Org / system supplied";
    return "01 · About your child";
};

/**
 * The importer's MEASURED reading of the immunization record, which differs from the hand baseline
 * by two. Both differences are recorded in the certification test rather than smoothed away.
 */
const MEASURED_OVERRIDE = {
    "05 · Immunization record": {
        needs: 15,
        note: "measured by the importer (baseline counted 13): EN/ES exemption blocks stay separate, and 'had chickenpox' stays separate from its date",
    },
};

const rows = new Map();
for (const f of FACTS) {
    const s = SECTION(f);
    if (!rows.has(s)) rows.set(s, { needs: 0, known: 0, collect: 0, conditional: 0, artifact: 0, buckets: {} });
    const r = rows.get(s);
    const participant = f.ask === "confirm" || f.ask === "collect";
    if (participant) r.needs += 1;
    if (f.ask === "confirm") r.known += 1;
    if (f.ask === "collect") r.collect += 1;
    if (f.conditional) r.conditional += 1;
    if (f.ack || f.signature) r.artifact += 1;
    const b = bucketOf(f.id);
    if (b) r.buckets[b] = (r.buckets[b] ?? 0) + 1;
}

const H = ["section", "needs", "known", "confirm", "collect", "cond.", "artifact"];
const W = [46, 6, 6, 8, 8, 6, 9];
const line = (cells) => cells.map((c, i) => (i === 0 ? String(c).padEnd(W[i]) : String(c).padStart(W[i]))).join("");
console.log(line(H));
console.log("─".repeat(W.reduce((a, b) => a + b, 0)));
let total = { needs: 0, known: 0, collect: 0, conditional: 0, artifact: 0 };
for (const s of [...rows.keys()].sort()) {
    const r = rows.get(s);
    const needs = MEASURED_OVERRIDE[s]?.needs ?? r.needs;
    console.log(line([s, needs, r.known, r.known, r.collect, r.conditional, r.artifact]));
    total.needs += needs;
    total.known += r.known;
    total.collect += r.collect;
    total.conditional += r.conditional;
    total.artifact += r.artifact;
}
console.log("─".repeat(W.reduce((a, b) => a + b, 0)));
console.log(line(["TOTAL", total.needs, total.known, total.known, total.collect, total.conditional, total.artifact]));
for (const [s, o] of Object.entries(MEASURED_OVERRIDE)) console.log(`\n${s}: ${o.note}`);

console.log("\nSlice-2 ownership per section (A–F over the unbound facts):");
for (const s of [...rows.keys()].sort()) {
    const b = rows.get(s).buckets;
    const parts = Object.keys(b).sort().map((k) => `${k}:${b[k]}`);
    if (parts.length) console.log(`  ${s.padEnd(46)} ${parts.join("  ")}`);
}
