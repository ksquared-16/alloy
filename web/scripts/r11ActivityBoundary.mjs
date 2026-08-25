/**
 * R11 — the initial Activity history boundary, measured on a production build.
 *
 * Separates two costs that look alike from the outside:
 *   - what initial Activity history adds to the record compose (its MARGINAL cost, which is the only
 *     thing that could delay first use), versus
 *   - what the whole first-paint dependency resolution costs (which Activity merely runs beside).
 * Reporting the second as the first is precisely the mistake the R11 telemetry correction fixes.
 *
 * Env: PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE / R11_OUT_DIR. Requires scripts/r11History.mjs.
 */
import { request } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, readSubjects, redactSubject, writeEvidence, withResource } from "./r11Env.mjs";

const DEMAND_LIMITS = [24, 100, 500];   // initial record / Activity tab + prewarm / endpoint cap
const bytes = (s) => Buffer.byteLength(s, "utf8");

async function measureSubject(api, id) {
    const row = { subject: redactSubject(id) };

    const t0 = Date.now();
    const res = await api.get(`${BASE}/api/admin/view-models/drawer/opportunity/${id}`);
    const text = await res.text();
    row.vm_status = res.status();
    row.vm_wall_ms = Date.now() - t0;
    row.vm_bytes = bytes(text);
    if (res.status() !== 200) return row;

    const vm = JSON.parse(text);
    const phases = vm?.timing?.phases_ms ?? {};
    row.compose_total_ms = phases.total_ms ?? null;
    row.first_paint_dependencies_ms = phases.first_paint_dependencies_ms ?? null;
    row.first_paint_resolve_ms = phases.first_paint_resolve_ms ?? null;
    row.activity_timeline_hydrate_ms = phases.activity_timeline_hydrate_ms ?? null;
    // The Activity leg is a SIBLING of the dependency leg, so what it could delay is only the amount
    // by which the whole resolve exceeds the dependency leg alone.
    row.activity_marginal_ms =
        typeof row.first_paint_resolve_ms === "number" && typeof row.first_paint_dependencies_ms === "number"
            ? row.first_paint_resolve_ms - row.first_paint_dependencies_ms
            : null;

    // The composed record is serialized at BOTH of these paths, so counting one copy understates the
    // wire cost. (The duplication itself is a composition concern, recorded as R15 evidence.)
    const recordPaths = [vm?.first_paint?.data?.record_visible, vm?.above_fold?.record].filter(Boolean);
    const copies = recordPaths.map((r) => r?._activity_timeline_events).filter(Array.isArray);
    row.initial_event_count = copies[0]?.length ?? 0;
    row.initial_event_bytes = copies[0] ? bytes(JSON.stringify(copies[0])) : 0;
    row.initial_event_copies = copies.length;
    row.initial_event_bytes_onwire = row.initial_event_bytes * (copies.length || 1);
    row.activity_share_pct = row.vm_bytes
        ? +((row.initial_event_bytes_onwire / row.vm_bytes) * 100).toFixed(1)
        : 0;

    for (const limit of DEMAND_LIMITS) {
        const t = Date.now();
        const r = await api.get(`${BASE}/api/admin/activity?entity_type=opportunity&entity_id=${id}&limit=${limit}`);
        const body = await r.text();
        let count = null;
        try {
            const j = JSON.parse(body);
            count = Array.isArray(j?.events) ? j.events.length : Array.isArray(j) ? j.length : null;
        } catch { /* a non-JSON body is reported by status alone */ }
        row[`demand_${limit}`] = { ms: Date.now() - t, bytes: bytes(body), count, status: r.status() };
    }
    return row;
}

assertLocalBase();
assertCandidateBuild();
const subjects = readSubjects().map((s) => (typeof s === "string" ? s : s.id));
const rows = await withResource(
    () => request.newContext({ storageState: STORAGE }),
    (api) => api.dispose(),
    async (api) => {
        const out = [];
        for (const id of subjects) {
            const r = await measureSubject(api, id);
            out.push(r);
            console.log(
                `  ${r.subject} vm=${r.vm_wall_ms}ms/${r.vm_bytes}B initial=${r.initial_event_count}ev x${r.initial_event_copies} ` +
                `marginal=${r.activity_marginal_ms}ms (activity leg ${r.activity_timeline_hydrate_ms}ms vs deps ${r.first_paint_dependencies_ms}ms)`,
            );
        }
        return out;
    },
);

console.log(`\n=== R11 initial boundary (n=${rows.filter((r) => r.vm_status === 200).length}) ===`);
for (const r of rows.filter((r) => r.vm_status === 200)) {
    console.log(`  ${r.subject}: Activity adds ${r.activity_marginal_ms}ms to a ${r.compose_total_ms}ms compose; ` +
        `${r.initial_event_bytes_onwire}B on the wire (${r.activity_share_pct}% of payload)`);
}
writeEvidence("initial-boundary.json", { base: BASE, rows });
