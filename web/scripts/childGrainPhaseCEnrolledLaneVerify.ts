/**
 * Phase C — Enrolled lane flip verification (local/staging DB via QueueService).
 *
 * Compares enrollment_completed lane with ALLOY_QUEUE_CHILD_GRAIN_LANES unset vs
 * enrollment_completed only. Also snapshots other lane counts (should be unchanged).
 *
 * Usage:
 *   cd web && npx tsx scripts/childGrainPhaseCEnrolledLaneVerify.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { getWorkUnitQueueItems, getWorkUnitQueueSummaries } from "@/lib/queues/QueueService";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG_ID = process.env.DEV_QUEUE_ORG_ID?.trim() || process.env.SIMULATION_ORG_ID?.trim();
const QUEUE_KEY = "enrollment_completed";
const OTHER_LANES = ["new_leads", "communications_followup", "tours", "enrollment_offers", "waitlist"] as const;

async function loadEnrollmentPipelineWu(orgId: string): Promise<string> {
    const { createAdminClient } = await import("@/lib/supabaseAdmin");
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", "enrollment_pipeline")
        .limit(1);
    if (error) throw new Error(`enrollment_pipeline WU query failed: ${error.message}`);
    const id = data?.[0]?.id;
    if (!id) throw new Error("enrollment_pipeline WU not found for org");
    return id as string;
}

function summarizeItems(items: unknown[]) {
    const rows = items.filter((x) => x != null && typeof x === "object") as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id ?? ""));
    const ocmrowCount = ids.filter((id) => id.startsWith("ocmrow:")).length;
    const oppCount = ids.filter((id) => !id.startsWith("ocmrow:") && !id.startsWith("pcrow:")).length;
    const sample = rows.slice(0, 5).map((r) => ({
        id: r.id,
        opportunity_id: r.opportunity_id,
        row_grain: r.row_grain,
        child: r._child_display_name,
        ctx_subject: (r._queue_row_context as { row_subject?: { subject_type?: string; subject_id?: string } } | undefined)
            ?.row_subject,
        placement: (r._queue_row_context as { placement_context?: unknown } | undefined)?.placement_context,
    }));
    return { total: rows.length, ocmrowCount, oppCount, sample };
}

async function enrolledLaneSnapshot(orgId: string, workUnitId: string, label: string) {
    const result = await getWorkUnitQueueItems({
        orgId,
        workUnitId,
        queueKey: QUEUE_KEY,
        limit: 50,
        offset: 0,
    });
    const summary = summarizeItems((result.result.items ?? []) as unknown[]);
    console.log(`\n--- ${label} ---`);
    console.log(`count (total): ${result.result.total}`);
    console.log(`items returned: ${summary.total} (ocmrow: ${summary.ocmrowCount}, bare opp: ${summary.oppCount})`);
    console.log("sample:", JSON.stringify(summary.sample, null, 2));
    return { ...summary, total: result.result.total };
}

async function laneCounts(orgId: string, workUnitId: string, label: string) {
    const summaries = await getWorkUnitQueueSummaries({
        orgId,
        workUnitId,
        includePreviews: false,
        summaryMode: "partial",
        partialQueueKeys: new Set(OTHER_LANES),
    });
    const counts: Record<string, number> = {};
    for (const q of summaries.queues) {
        counts[q.key] = q.count;
    }
    console.log(`\n--- Other lanes (${label}) ---`);
    console.table(
        OTHER_LANES.map((key) => ({ lane: key, count: counts[key] ?? "—" })),
    );
    return counts;
}

async function main() {
    if (!ORG_ID) {
        console.error("Set DEV_QUEUE_ORG_ID or SIMULATION_ORG_ID");
        process.exit(1);
    }

    const workUnitId = await loadEnrollmentPipelineWu(ORG_ID);
    console.log(`org_id=${ORG_ID}`);
    console.log(`work_unit_id=${workUnitId}`);
    console.log(`git Phase B expected on code path: enrollment_completed OCM when flag set`);

    const prevFlag = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;

    const beforeEnrolled = await enrolledLaneSnapshot(ORG_ID, workUnitId, "BEFORE (flag unset)");
    const beforeOthers = await laneCounts(ORG_ID, workUnitId, "flag unset");

    process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = "enrollment_completed";

    const afterEnrolled = await enrolledLaneSnapshot(ORG_ID, workUnitId, "AFTER (flag=enrollment_completed)");
    const afterOthers = await laneCounts(ORG_ID, workUnitId, "flag=enrollment_completed");

    if (prevFlag === undefined) delete process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    else process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES = prevFlag;

    console.log("\n--- Delta (Enrolled) ---");
    console.table([
        {
            metric: "total count",
            before: beforeEnrolled.total,
            after: afterEnrolled.total,
            delta: afterEnrolled.total - beforeEnrolled.total,
        },
        {
            metric: "ocmrow items in page",
            before: beforeEnrolled.ocmrowCount,
            after: afterEnrolled.ocmrowCount,
            delta: afterEnrolled.ocmrowCount - beforeEnrolled.ocmrowCount,
        },
        {
            metric: "bare opportunity ids",
            before: beforeEnrolled.oppCount,
            after: afterEnrolled.oppCount,
            delta: afterEnrolled.oppCount - beforeEnrolled.oppCount,
        },
    ]);

    const otherDeltas = OTHER_LANES.map((key) => ({
        lane: key,
        before: beforeOthers[key] ?? 0,
        after: afterOthers[key] ?? 0,
        delta: (afterOthers[key] ?? 0) - (beforeOthers[key] ?? 0),
    }));
    console.log("\n--- Other lane count deltas (expect 0) ---");
    console.table(otherDeltas);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
