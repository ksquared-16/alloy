/**
 * READ-ONLY: are the child-grain lenses honestly empty, or empty because the row source is wrong?
 *
 * `Registration` and `Waitlist` resolve Row Grain = child and return terminal=empty / rows=0. The
 * provisioning answer's ONLY record read is `.from("opportunities")` (workUnitProvisioningAnswer.ts:442),
 * so this asks the other question: do child-grain subjects actually exist for those stages?
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), {
    auth: { persistSession: false },
});
const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19"; // Firefly

const { data: depts } = await db.from("departments").select("id, name, metadata").eq("org_id", ORG);
for (const d of depts ?? []) {
    const md = d.metadata ?? {};
    const views = md.work_views_v1 ?? [];
    if (!views.length) continue;
    console.log(`\nDEPT "${d.name}" — work_views_v1 (${views.length}):`);
    for (const v of views) {
        const stageFilters = (v.filters_v1 ?? [])
            .filter((f) => f.field_key === "opportunity_stage")
            .flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]));
        console.log(
            `  id=${v.id} label="${v.label}" visible=${v.is_visible ?? v.visible ?? "-"} stages=[${stageFilters.join(", ")}]`,
        );
    }
    const stages = md.lifecycle_builder_v1?.stages ?? md.lifecycle_builder_v1?.processes?.[0]?.stages ?? null;
    if (Array.isArray(stages)) {
        console.log(`  STAGES: ${stages.map((s) => `${s.key}:${s.grain ?? "-"}`).join("  ")}`);
    }
}

console.log("\n--- opportunities by stage (the ONLY row source the answer reads) ---");
const { data: opps } = await db.from("opportunities").select("id, stage_key, status_key").eq("org_id", ORG).limit(1000);
const oppByStage = new Map();
for (const o of opps ?? []) oppByStage.set(o.stage_key ?? "(null)", (oppByStage.get(o.stage_key ?? "(null)") ?? 0) + 1);
for (const [k, n] of [...oppByStage].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(26)} ${n}`);

console.log("\n--- opportunity_customer_members (the CHILD-grain subjects) ---");
const { data: ocm, error: ocmErr } = await db
    .from("opportunity_customer_members")
    .select("id, opportunity_id, status_key, customer_member_id")
    .limit(1000);
if (ocmErr) console.log(`  ERROR ${ocmErr.message}`);
else {
    const byStatus = new Map();
    for (const m of ocm ?? []) byStatus.set(m.status_key ?? "(null)", (byStatus.get(m.status_key ?? "(null)") ?? 0) + 1);
    console.log(`  total=${ocm?.length ?? 0}`);
    for (const [k, n] of [...byStatus].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(26)} ${n}`);
}

console.log("\n--- placement_candidates (the CANDIDATE-grain subjects) ---");
const { data: pc, error: pcErr } = await db.from("placement_candidates").select("id, status").limit(500);
if (pcErr) console.log(`  ERROR ${pcErr.message}`);
else console.log(`  total=${pc?.length ?? 0}`);

console.log("\n--- child_placements / schedule_assignments (operational truth for a child surface) ---");
for (const t of ["child_placements", "schedule_assignments", "child_enrollment_agreements"]) {
    const { data, error } = await db.from(t).select("id").limit(200);
    console.log(`  ${t.padEnd(28)} ${error ? `ERROR ${error.message}` : `rows=${data?.length ?? 0}`}`);
}
