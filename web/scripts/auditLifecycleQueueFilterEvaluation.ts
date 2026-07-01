/**
 * Side-by-side queue filter proof for a builder stage (e.g. enrolling).
 *
 * Usage (from web/):
 *   DEPARTMENT_ID=<uuid> STAGE_KEY=enrolling npx tsx --tsconfig tsconfig.json scripts/auditLifecycleQueueFilterEvaluation.ts
 */

import { createAdminClient } from "../lib/supabaseAdmin";
import { lifecycleActivationFromMetadata } from "../lib/lifecycle/lifecycleActivationConfig";
import {
    buildLifecycleQueueFilterEvaluationCompare,
    formatQueueFilterEvaluationCompareReport,
} from "../lib/lifecycle/lifecycleQueueFilterEvaluationCompare";

async function main() {
    const departmentId = process.env.DEPARTMENT_ID?.trim();
    const stageKey = process.env.STAGE_KEY?.trim() || "enrolling";
    if (!departmentId) {
        console.error("DEPARTMENT_ID is required");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { data: dept, error } = await supabase
        .from("departments")
        .select("id, org_id, metadata")
        .eq("id", departmentId)
        .maybeSingle();
    if (error || !dept) {
        console.error(error?.message ?? "Department not found");
        process.exit(1);
    }

    const orgId = process.env.ORG_ID?.trim() || String((dept as { org_id: string }).org_id);
    const activation = lifecycleActivationFromMetadata((dept as { metadata?: unknown }).metadata);
    if (!activation) {
        console.error("No activation bundle on department metadata");
        process.exit(1);
    }

    const compare = await buildLifecycleQueueFilterEvaluationCompare({
        supabase,
        orgId,
        departmentId,
        stageKey,
        stageLabel: activation.stage_key === stageKey ? activation.stage_label : null,
        activation,
    });

    console.log(formatQueueFilterEvaluationCompareReport(compare));
    process.exit(compare.diverges ? 2 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
