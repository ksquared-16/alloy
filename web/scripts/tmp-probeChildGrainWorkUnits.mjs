/**
 * READ-ONLY probe: does the certified tenant already have work units whose DECLARED subject grain
 * is child/candidate, and are they operator-visible?
 *
 * The repo's seed dumps carry no `work_units` rows, so this question is only answerable live.
 * No writes. Nothing printed but ids, keys and grains.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
    console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: orgs, error: orgErr } = await db.from("orgs").select("id, name").limit(20);
if (orgErr) { console.error("orgs:", orgErr.message); process.exit(1); }
console.log("ORGS:");
for (const o of orgs ?? []) console.log(`  ${o.id}  ${o.name}`);

const { data: units, error: wuErr } = await db
    .from("work_units")
    .select("id, org_id, department_id, key, name, is_active, sort_order, queue_definition, metadata")
    .order("org_id")
    .limit(500);
if (wuErr) { console.error("work_units:", wuErr.message); process.exit(1); }

console.log(`\nWORK UNITS: ${units?.length ?? 0}`);
const byGrain = new Map();
for (const u of units ?? []) {
    const meta = (u.metadata ?? {});
    const qm = meta.queue_membership_v1 ?? null;
    const stageKey = meta.lifecycle_stage_key ?? null;
    const declared = qm?.subject_type ?? null;
    const countUnit = qm?.count_unit ?? null;
    const qd = u.queue_definition ?? {};
    const qdGrains = [
        ...new Set(
            (Array.isArray(qd?.queues) ? qd.queues : [])
                .map((q) => q?.grain)
                .filter(Boolean),
        ),
    ];
    const bucket = declared ?? "(none declared)";
    byGrain.set(bucket, (byGrain.get(bucket) ?? 0) + 1);
    if (declared && declared !== "case") {
        console.log(
            `  NON-CASE  org=${u.org_id.slice(0, 8)} key=${u.key} active=${u.is_active} ` +
                `stage=${stageKey} subject_type=${declared} count_unit=${countUnit}` +
                (qdGrains.length ? ` qd_grains=[${qdGrains.join(",")}]` : ""),
        );
    } else if (qdGrains.some((g) => g !== "case")) {
        console.log(
            `  QD-NON-CASE  org=${u.org_id.slice(0, 8)} key=${u.key} active=${u.is_active} ` +
                `declared=${declared ?? "-"} qd_grains=[${qdGrains.join(",")}]`,
        );
    }
}
console.log("\nDECLARED subject_type histogram:");
for (const [g, n] of [...byGrain].sort((a, b) => b[1] - a[1])) console.log(`  ${String(g).padEnd(18)} ${n}`);

// Stage grain, the OTHER axis — this is what the provisioning answer's RowGrain reads.
const { data: depts, error: dErr } = await db.from("departments").select("id, org_id, name, metadata").limit(50);
if (dErr) { console.error("departments:", dErr.message); process.exit(1); }
console.log("\nSTAGE GRAINS declared in business-process builders (the RowGrain axis):");
for (const d of depts ?? []) {
    const md = d.metadata ?? {};
    const procs = md.lifecycle_builder_v1?.processes ?? md.business_processes_v1 ?? null;
    const stages = [];
    const collect = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node.stages)) for (const s of node.stages) stages.push(s);
        for (const v of Object.values(node)) if (v && typeof v === "object") collect(v);
    };
    collect(procs ?? md);
    const grains = stages
        .map((s) => ({ key: s?.key, grain: s?.grain }))
        .filter((s) => s.key);
    if (!grains.length) continue;
    const nonFamily = grains.filter((g) => g.grain && g.grain !== "family");
    console.log(
        `  dept=${d.id.slice(0, 8)} org=${d.org_id.slice(0, 8)} "${d.name}" stages=${grains.length}` +
            ` non-family=${nonFamily.length}`,
    );
    for (const g of nonFamily) console.log(`      stage=${g.key} grain=${g.grain}`);
    const undeclared = grains.filter((g) => !g.grain).map((g) => g.key);
    if (undeclared.length) console.log(`      (no grain declared: ${undeclared.join(", ")})`);
}
