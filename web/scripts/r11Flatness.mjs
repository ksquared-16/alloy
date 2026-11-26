/**
 * R11 — is Activity retrieval cost a function of the requested limit?
 *
 * This is what decides whether lowering the initial boundary could help at all. If cost is FLAT in
 * the limit, a smaller boundary buys no time and any reduction must be argued on payload alone.
 *
 * Trials are interleaved and the limit order alternates per trial, so warm-up and host drift cannot
 * manufacture a slope that is really just "whatever ran first was slowest".
 *
 * Env: PE3_* / R11_OUT_DIR / R11_TRIALS. Subject comes from scripts/r11History.mjs (largest history).
 */
import { request } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, readSubjects, redactSubject, writeEvidence, withResource } from "./r11Env.mjs";

const TRIALS = Number(process.env.R11_TRIALS ?? 12);
const LIMITS = [8, 24, 50, 100, 200, 500];
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

assertLocalBase();
assertCandidateBuild();
const subjects = readSubjects();
if (!subjects.length) throw new Error("no subject with history — run scripts/r11History.mjs first");
// The deepest-history subject is the only one that can reveal a row-count cost if one exists.
const subject = typeof subjects[0] === "string" ? subjects[0] : subjects[0].id;

const acc = await withResource(
    () => request.newContext({ storageState: STORAGE }),
    (api) => api.dispose(),
    async (api) => {
        const a = Object.fromEntries(LIMITS.map((l) => [l, { ms: [], bytes: 0, count: 0 }]));
        const url = (l) => `${BASE}/api/admin/activity?entity_type=opportunity&entity_id=${subject}&limit=${l}`;
        await api.get(url(24));   // warm once: the first call would otherwise measure route compile
        for (let t = 0; t < TRIALS; t++) {
            const order = t % 2 ? [...LIMITS] : [...LIMITS].reverse();
            for (const l of order) {
                const t0 = Date.now();
                const res = await api.get(url(l));
                const text = await res.text();
                a[l].ms.push(Date.now() - t0);
                a[l].bytes = Buffer.byteLength(text, "utf8");
                const j = JSON.parse(text);
                a[l].count = Array.isArray(j?.events) ? j.events.length : Array.isArray(j) ? j.length : 0;
            }
        }
        return a;
    },
);

console.log(`subject ${redactSubject(subject)} — ${TRIALS} interleaved trials per limit\n`);
console.log("limit   events   bytes    p50ms  min  max");
for (const l of LIMITS) {
    const a = acc[l];
    console.log(`${String(l).padEnd(7)} ${String(a.count).padEnd(8)} ${String(a.bytes).padEnd(8)} ${String(median(a.ms)).padEnd(6)} ${Math.min(...a.ms)}   ${Math.max(...a.ms)}`);
}
const lo = LIMITS[0], hi = LIMITS[LIMITS.length - 1];
const slope = median(acc[hi].ms) - median(acc[lo].ms);
// A slope only means something if it exceeds the run-to-run noise of a SINGLE limit. Comparing it to
// a fixed constant would call a quiet host "flat" and a busy one "growing" for the same behaviour.
const noise = Math.max(...LIMITS.map((l) => Math.max(...acc[l].ms) - Math.min(...acc[l].ms)));
const perEvent = (slope / Math.max(1, acc[hi].count - acc[lo].count)).toFixed(2);
console.log(`\nslope ${acc[lo].count} -> ${acc[hi].count} events: ${slope}ms (${perEvent}ms/event); noise band ${noise}ms`);
console.log(slope < noise
    ? "FLAT — the slope is inside measurement noise: cost is fixed overhead, not row cost, so a smaller initial boundary buys no time."
    : "NOT FLAT — cost grows with rows beyond noise; a smaller boundary could reduce latency.");
writeEvidence("flatness.json", {
    base: BASE,
    subject: redactSubject(subject),
    trials: TRIALS,
    by_limit: Object.fromEntries(LIMITS.map((l) => [l, { count: acc[l].count, bytes: acc[l].bytes, p50_ms: median(acc[l].ms), min_ms: Math.min(...acc[l].ms), max_ms: Math.max(...acc[l].ms) }])),
    slope_ms: slope,
    noise_band_ms: noise,
    ms_per_event: Number(perEvent),
    verdict: slope < noise ? "flat" : "not_flat",
});
