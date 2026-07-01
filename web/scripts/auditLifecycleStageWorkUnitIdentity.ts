/**
 * Audit lifecycle stage work unit identity for a builder stage (e.g. enrolling).
 *
 * Usage (from web/):
 *   DEPARTMENT_ID=<uuid> STAGE_KEY=enrolling npx tsx --tsconfig tsconfig.json scripts/auditLifecycleStageWorkUnitIdentity.ts
 *
 * Optional: ORG_ID (resolved from department when omitted)
 */

import { createAdminClient } from "../lib/supabaseAdmin";
import {
    buildLifecycleStageWorkUnitIdentityAudit,
    formatLifecycleStageWorkUnitIdentityAudit,
} from "../lib/lifecycle/lifecycleStageWorkUnitIdentity";
import { lifecycleActivationFromMetadata } from "../lib/lifecycle/lifecycleActivationConfig";

async function main() {
    const departmentId = process.env.DEPARTMENT_ID?.trim();
    const stageKey = process.env.STAGE_KEY?.trim() || "enrolling";
    if (!departmentId) {
        console.error("DEPARTMENT_ID is required");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, org_id, name, metadata")
        .eq("id", departmentId)
        .maybeSingle();
    if (deptErr || !dept) {
        console.error(deptErr?.message ?? "Department not found");
        process.exit(1);
    }

    const orgId = process.env.ORG_ID?.trim() || String((dept as { org_id: string }).org_id);
    const activation = lifecycleActivationFromMetadata((dept as { metadata?: unknown }).metadata);
    const builder = (dept as { metadata?: unknown }).metadata;
    const stageLabel =
        activation?.stage_key === stageKey ? activation.stage_label : stageKey.replace(/_/g, " ");

    const audit = await buildLifecycleStageWorkUnitIdentityAudit({
        supabase,
        orgId,
        departmentId,
        stageKey,
        stageLabel,
        activation,
    });

    console.log(formatLifecycleStageWorkUnitIdentityAudit(audit));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
