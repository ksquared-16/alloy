#!/usr/bin/env npx tsx
/**
 * Phase B — seed queue_membership_v1 on enrollment lifecycle builder stages + lifecycle_wu_* metadata.
 *
 * Metadata only — does not change queue_definition or QueueService routing.
 *
 * Dry run (default):
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts
 *
 * Apply:
 *   CONFIRM_QUEUE_MEMBERSHIP_SEED=1 ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts
 *
 * Optional: DEPARTMENT_ID=<uuid> to scope to one department.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    applyEnrollmentQueueMembershipSeedToDepartmentMetadata,
    applyEnrollmentQueueMembershipSeedToWorkUnitMetadata,
    planEnrollmentQueueMembershipSeed,
    summarizeEnrollmentQueueMembershipSeedPlan,
    type EnrollmentQueueMembershipSeedPlan,
} from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const orgId =
    process.env.ORG_ID?.trim() ??
    process.env.SIMULATION_ORG_ID?.trim() ??
    process.env.DEV_QUEUE_ORG_ID?.trim() ??
    "";

const departmentIdFilter = process.env.DEPARTMENT_ID?.trim() ?? "";
const confirm = process.env.CONFIRM_QUEUE_MEMBERSHIP_SEED === "1";

type DepartmentRow = {
    id: string;
    org_id: string;
    name: string;
    key: string;
    metadata: unknown;
};

async function loadWorkUnitsForDepartment(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    departmentId: string,
) {
    const { data, error } = await supabase
        .from("work_units")
        .select("id, key, metadata, queue_definition, department_id")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .like("key", "lifecycle_wu_%");
    if (error) throw new Error(error.message);
    return data ?? [];
}

async function applyPlan(
    supabase: ReturnType<typeof createAdminClient>,
    department: DepartmentRow,
    plan: EnrollmentQueueMembershipSeedPlan,
) {
    if (!plan.builder_metadata_changed && plan.work_unit_ids_to_update.length === 0) {
        return;
    }

    if (plan.builder_metadata_changed) {
        const nextMetadata = applyEnrollmentQueueMembershipSeedToDepartmentMetadata(
            department.metadata,
            plan,
        );
        const { error } = await supabase
            .from("departments")
            .update({ metadata: nextMetadata })
            .eq("org_id", department.org_id)
            .eq("id", department.id);
        if (error) throw new Error(`departments update: ${error.message}`);
    }

    for (const wuAction of plan.work_unit_actions) {
        if (wuAction.action !== "seeded" || !wuAction.work_unit_id || !wuAction.membership_after) {
            continue;
        }
        const workUnit = await supabase
            .from("work_units")
            .select("id, metadata, queue_definition")
            .eq("org_id", department.org_id)
            .eq("id", wuAction.work_unit_id)
            .maybeSingle();
        if (workUnit.error) throw new Error(workUnit.error.message);
        if (!workUnit.data) continue;

        const queueDefinitionBefore = JSON.stringify(workUnit.data.queue_definition);
        const nextWuMetadata = applyEnrollmentQueueMembershipSeedToWorkUnitMetadata(
            workUnit.data.metadata,
            wuAction.membership_after,
        );
        const { error } = await supabase
            .from("work_units")
            .update({ metadata: nextWuMetadata })
            .eq("org_id", department.org_id)
            .eq("id", wuAction.work_unit_id);
        if (error) throw new Error(`work_units update ${wuAction.work_unit_id}: ${error.message}`);

        const after = await supabase
            .from("work_units")
            .select("queue_definition")
            .eq("id", wuAction.work_unit_id)
            .maybeSingle();
        if (after.error) throw new Error(after.error.message);
        const queueDefinitionAfter = JSON.stringify(after.data?.queue_definition);
        if (queueDefinitionBefore !== queueDefinitionAfter) {
            throw new Error(
                `queue_definition changed for work_unit ${wuAction.work_unit_id} — aborting`,
            );
        }
    }
}

function departmentHasEnrollmentBuilder(metadata: unknown): boolean {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    return builder.processes.some((p) => p.key === ENROLLMENT_PROCESS_KEY && p.is_active);
}

async function main() {
    if (!orgId) {
        console.error("Set ORG_ID, SIMULATION_ORG_ID, or DEV_QUEUE_ORG_ID.");
        process.exit(1);
    }

    console.log(
        confirm
            ? "=== EXECUTE enrollment queue_membership_v1 seed (metadata only) ==="
            : "=== DRY RUN enrollment queue_membership_v1 seed (metadata only) ===",
    );
    console.log({ orgId, departmentIdFilter: departmentIdFilter || "all", confirm });

    const supabase = createAdminClient();
    let deptQuery = supabase.from("departments").select("id, org_id, name, key, metadata").eq("org_id", orgId);
    if (departmentIdFilter) {
        deptQuery = deptQuery.eq("id", departmentIdFilter);
    }
    const { data: departments, error: deptError } = await deptQuery;
    if (deptError) {
        console.error(deptError.message);
        process.exit(1);
    }

    const targets = (departments ?? []).filter((d) => departmentHasEnrollmentBuilder(d.metadata));
    if (!targets.length) {
        console.log("No departments with enrollment lifecycle_builder_v1 process found.");
        process.exit(0);
    }

    let plansApplied = 0;
    let stagesSeeded = 0;
    let workUnitsSeeded = 0;
    let skippedStages = 0;

    for (const department of targets as DepartmentRow[]) {
        const workUnits = await loadWorkUnitsForDepartment(supabase, orgId, department.id);
        const lifecycleWuCount = workUnits.filter((wu) =>
            isLifecycleStageWorkUnitKey(String(wu.key ?? "")),
        ).length;

        const plan = planEnrollmentQueueMembershipSeed({
            departmentId: department.id,
            orgId,
            departmentMetadata: department.metadata,
            workUnits,
        });

        if (!plan) {
            console.log(`\n--- skip department ${department.id} (${department.name}) — no enrollment process ---`);
            continue;
        }

        console.log(`\n--- ${department.name} (${department.key}) id=${department.id} lifecycle_wu_rows=${lifecycleWuCount} ---`);
        console.log(summarizeEnrollmentQueueMembershipSeedPlan(plan));

        for (const row of plan.stage_actions) {
            if (row.action === "seeded") stagesSeeded += 1;
            else skippedStages += 1;
        }
        workUnitsSeeded += plan.work_unit_actions.filter((r) => r.action === "seeded").length;

        if (confirm) {
            await applyPlan(supabase, department, plan);
            plansApplied += 1;
        }
    }

    console.log("\n=== summary ===");
    console.log({
        departments_scanned: targets.length,
        plans_applied: confirm ? plansApplied : 0,
        stages_seeded: stagesSeeded,
        work_units_seeded: workUnitsSeeded,
        stages_skipped: skippedStages,
        dry_run: !confirm,
    });

    if (!confirm) {
        console.log(
            "\nTo apply: CONFIRM_QUEUE_MEMBERSHIP_SEED=1 ORG_ID=" +
                orgId +
                " npx tsx --tsconfig tsconfig.json scripts/seedEnrollmentQueueMembershipV1.ts",
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
