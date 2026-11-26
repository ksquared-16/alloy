/**
 * Read-only: dump Firefly's Work View declarations through the PRODUCTION readers, so this never
 * becomes a second definition of where a lens lives.
 * Run from web/ with the trusted env sourced:  npx tsx scripts/tmp-listFireflyWorkViews.ts
 */
import { createClient } from "@supabase/supabase-js";
import { savedWorkViewsFromDepartmentMetadata } from "../lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "../lib/lifecycle/lifecycleBuilderConfig";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19"; // Firefly
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413"; // Enrollment

async function main() {
    const url = process.env.SUPABASE_URL!.trim();
    console.log("supabase project:", url.replace(/^https:\/\//, "").split(".")[0], "\n");
    const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
        auth: { persistSession: false },
    });

    const { data: dept } = await db.from("departments").select("id, name, metadata").eq("id", DEPT).maybeSingle();
    const meta = (dept as { metadata?: unknown } | null)?.metadata;

    const builder = lifecycleBuilderFromDepartmentMetadata(meta);
    const bp = activeLifecycleProcess(builder);
    console.log("active process:", bp?.key, "—", bp?.name);

    const stages = activeStagesForProcess(bp!);
    console.log("\nactive stages:");
    for (const s of stages) {
        console.log(
            `  ${s.key.padEnd(16)} grain=${String((s as Record<string, unknown>).grain ?? "-").padEnd(8)} ` +
                `plan_segment=${String(
                    (s.stage_operating_plan_v1 as Record<string, unknown> | null)?.journey_segment ?? "-",
                ).padEnd(8)} label="${s.label}"`,
        );
    }

    const views = savedWorkViewsFromDepartmentMetadata(meta);
    console.log(`\nwork views (${views.length}):`);
    for (const v of views) {
        console.log(
            "  " +
                JSON.stringify({
                    id: v.id,
                    label: v.label,
                    row_grain_v1: (v as Record<string, unknown>).row_grain_v1 ?? null,
                    display_order: v.display_order ?? null,
                    visible: (v as Record<string, unknown>).visible ?? null,
                    match: v.match ?? null,
                    filters_v1: v.filters_v1 ?? null,
                }),
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
