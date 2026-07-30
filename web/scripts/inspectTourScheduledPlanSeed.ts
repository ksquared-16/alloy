/**
 * Dry-run: inspect whether Firefly (or ORG_ID) Lead published plan needs Tour Scheduled re-seed.
 *
 *   cd web && npx tsx scripts/inspectTourScheduledPlanSeed.ts
 *   APPLY=1 …  (writes only when merge reports changed AND no conflicting keys — still requires APPLY=1)
 *
 * Does not overwrite intentional tenant configuration.
 */

import { createClient } from "@supabase/supabase-js";
import { mergeTourScheduledDefaultsIntoLeadPlan } from "@/lib/lifecycle/mergeTourScheduledDefaultsIntoLeadPlan";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const ORG = process.env.ORG_ID?.trim() || process.env.DEV_QUEUE_ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";
const APPLY = process.env.APPLY === "1";

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
        process.exit(1);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { data: depts, error } = await supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("org_id", ORG)
        .eq("is_active", true);
    if (error) throw error;

    let found = false;
    for (const dept of depts ?? []) {
        const metadata =
            dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
                ? (dept.metadata as Record<string, unknown>)
                : {};
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const process = activeLifecycleProcess(builder);
        if (process?.key !== "enrollment") continue;
        const lead = process.stages.find((s) => s.key === "lead" && s.is_active);
        if (!lead) continue;
        found = true;
        const published = parseStageOperatingPlanV1(
            (lead as { stage_operating_plan_v1?: unknown }).stage_operating_plan_v1,
        );
        console.log(`Department: ${dept.name} (${dept.id})`);
        if (!published) {
            console.log("  Lead plan: none published — code defaults apply (Tour Scheduled included). Re-seed NOT required.");
            continue;
        }
        const hasTourScheduled = published.outcomes.some((o) => o.outcome_key === "tour_scheduled");
        const hasRule = published.outcome_rules.some(
            (r) =>
                r.when_outcome_key === "tour_scheduled"
                || (r.when_domain_signal?.domain === "tour_booking" && r.when_domain_signal?.signal === "scheduled"),
        );
        console.log(`  Lead plan: published (outcomes=${published.outcomes.length}, rules=${published.outcome_rules.length})`);
        console.log(`  tour_scheduled outcome: ${hasTourScheduled ? "present" : "MISSING"}`);
        console.log(`  tour_scheduled / tour_booking rule: ${hasRule ? "present" : "MISSING"}`);

        const { plan, report } = mergeTourScheduledDefaultsIntoLeadPlan(published);
        console.log(`  merge report:`, report);
        if (!report.changed) {
            console.log("  Re-seed NOT required (already configured or conflicting keys skipped).");
            continue;
        }
        console.log("  Re-seed REQUIRED for browser certification of Tour Scheduled path.");
        if (!APPLY) {
            console.log("  Dry-run only. Re-run with APPLY=1 to write merged plan onto the Lead stage.");
            continue;
        }
        const stages = process.stages.map((s) =>
            s.key === "lead" ? { ...s, stage_operating_plan_v1: plan } : s,
        );
        const nextBuilder = {
            ...builder!,
            processes: builder!.processes.map((p) =>
                p.id === process.id ? { ...p, stages } : p,
            ),
        };
        const nextMetadata = {
            ...metadata,
            lifecycle_builder_v1: nextBuilder,
        };
        const { error: upErr } = await supabase
            .from("departments")
            .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
            .eq("id", dept.id)
            .eq("org_id", ORG);
        if (upErr) throw upErr;
        console.log("  Applied Tour Scheduled defaults (additive merge).");
    }
    if (!found) console.log("No enrollment department found for org", ORG);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
