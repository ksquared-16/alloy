/**
 * R11 — history-size census.
 *
 * Asks the operator's own Activity endpoint how much history each candidate carries, so the sample
 * size behind any Activity claim is a measured fact rather than an assumption. Candidates that are
 * not opportunities simply return no events and drop out.
 */
import { request } from "playwright";
import fs from "fs";
import { join } from "path";
import { BASE, STORAGE, OUT_DIR, assertLocalBase, assertCandidateBuild, redactSubject, writeEvidence, withResource } from "./r11Env.mjs";

const CAP = 500;   // the endpoint's own maximum — a census must not be truncated below it

assertLocalBase();
assertCandidateBuild();
const candidates = JSON.parse(fs.readFileSync(join(OUT_DIR, "candidates.json"), "utf8"));
const subjects = await withResource(
    () => request.newContext({ storageState: STORAGE }),
    (api) => api.dispose(),
    async (api) => {
        const found = [];
        for (const id of candidates) {
            const res = await api.get(`${BASE}/api/admin/activity?entity_type=opportunity&entity_id=${id}&limit=${CAP}`);
            if (res.status() !== 200) continue;
            const body = await res.json().catch(() => null);
            const events = Array.isArray(body?.events) ? body.events : Array.isArray(body) ? body : [];
            if (events.length > 0) found.push({ id, total_events: events.length });
        }
        return found.sort((a, b) => b.total_events - a.total_events);
    },
);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(join(OUT_DIR, "subjects.json"), JSON.stringify(subjects, null, 1));   // working state
console.log(`subjects with history: ${subjects.length} of ${candidates.length} candidates`);
subjects.forEach((s) => console.log(`  ${redactSubject(s.id)}  ${s.total_events} events`));
const totals = subjects.map((s) => s.total_events);
if (totals.length) {
    console.log(`\nmin=${Math.min(...totals)} max=${Math.max(...totals)} at_or_over_cap=${totals.filter((n) => n >= CAP).length}`);
}
writeEvidence("history-census.json", {
    base: BASE,
    candidates: candidates.length,
    subjects: subjects.map((s) => ({ subject: redactSubject(s.id), total_events: s.total_events })),
});
