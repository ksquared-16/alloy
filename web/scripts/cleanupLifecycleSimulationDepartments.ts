#!/usr/bin/env npx tsx
/**
 * Remove simulation/debug lifecycle departments from an org.
 *
 * Usage:
 *   # Dry run (lists targets only):
 *   npx tsx scripts/cleanupLifecycleSimulationDepartments.ts
 *
 *   # Execute cleanup:
 *   CONFIRM_SIMULATION_CLEANUP=1 SIMULATION_ORG_ID=<uuid> npx tsx scripts/cleanupLifecycleSimulationDepartments.ts
 *
 * Optional: ENROLLMENT_PIPELINE_WORK_UNIT_ID — restore moved opportunities to this work unit before delete.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { deleteActivationLifecycleForDepartment } from "@/lib/lifecycle/lifecycleActivationOwned";
import {
    isSimulationDepartmentRow,
    PROTECTED_DEPARTMENT_KEYS,
} from "@/lib/lifecycle/lifecycleSimulationMarkers";
import { getSimulationOrgId, requireCleanupConfirm } from "./lib/lifecycleSimulationGuard";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const execute = process.env.CONFIRM_SIMULATION_CLEANUP === "1";

async function main() {
    const orgId = execute ? requireCleanupConfirm("cleanupLifecycleSimulationDepartments") : getSimulationOrgId();

    console.log(execute ? "=== EXECUTE simulation cleanup ===" : "=== DRY RUN simulation cleanup ===");
    console.log({ orgId, protected_keys: [...PROTECTED_DEPARTMENT_KEYS] });

    const supabase = createAdminClient();

    const { data: depts, error: deptsErr } = await supabase
        .from("departments")
        .select("id, key, name, description, metadata, is_active")
        .eq("org_id", orgId);
    if (deptsErr) throw new Error(deptsErr.message);

    const targets = (depts ?? []).filter((d) => isSimulationDepartmentRow(d as { key: string; name: string }));
    if (!targets.length) {
        console.log("\nNo simulation departments found. Workspace should be clean.");
        return;
    }

    console.log(`\nFound ${targets.length} simulation department(s):`);
    for (const d of targets) {
        console.log(`  - ${(d as { name: string }).name} (${(d as { id: string }).id}) key=${(d as { key: string }).key}`);
    }

    const enrollmentWuId = process.env.ENROLLMENT_PIPELINE_WORK_UNIT_ID?.trim() ?? "";
    if (!enrollmentWuId && execute) {
        const { data: enrollDept } = await supabase
            .from("departments")
            .select("id")
            .eq("org_id", orgId)
            .eq("key", "enrollment")
            .maybeSingle();
        if (enrollDept?.id) {
            const { data: wu } = await supabase
                .from("work_units")
                .select("id")
                .eq("org_id", orgId)
                .eq("department_id", enrollDept.id)
                .eq("key", "enrollment_pipeline")
                .eq("is_active", true)
                .maybeSingle();
            if (wu?.id) {
                console.log(`\nWill restore opportunities to enrollment_pipeline work unit ${wu.id}`);
            }
        }
    }

    if (!execute) {
        console.log("\nDry run complete. To delete, run:");
        console.log(
            "  CONFIRM_SIMULATION_CLEANUP=1 SIMULATION_ORG_ID=" +
                orgId +
                " npx tsx scripts/cleanupLifecycleSimulationDepartments.ts"
        );
        return;
    }

    let restoreWuId = enrollmentWuId;
    if (!restoreWuId) {
        const { data: enrollDept } = await supabase
            .from("departments")
            .select("id")
            .eq("org_id", orgId)
            .eq("key", "enrollment")
            .maybeSingle();
        if (enrollDept?.id) {
            const { data: wu } = await supabase
                .from("work_units")
                .select("id")
                .eq("org_id", orgId)
                .eq("department_id", enrollDept.id)
                .eq("key", "enrollment_pipeline")
                .maybeSingle();
            restoreWuId = (wu as { id?: string } | null)?.id ?? "";
        }
    }

    for (const d of targets) {
        const deptId = (d as { id: string }).id;
        const { data: wus } = await supabase
            .from("work_units")
            .select("id")
            .eq("org_id", orgId)
            .eq("department_id", deptId);
        const wuIds = (wus ?? []).map((w) => (w as { id: string }).id);

        if (restoreWuId && wuIds.length) {
            const { data: moved, error: movErr } = await supabase
                .from("opportunities")
                .update({ work_unit_id: restoreWuId, updated_at: new Date().toISOString() })
                .eq("org_id", orgId)
                .in("work_unit_id", wuIds)
                .select("id");
            if (movErr) console.warn(`  WARN restore opps for ${deptId}:`, movErr.message);
            else if (moved?.length) console.log(`  Restored ${moved.length} opportunity(s) to enrollment pipeline`);
        }

        await supabase.from("user_department_access").delete().eq("org_id", orgId).eq("department_id", deptId);

        const del = await deleteActivationLifecycleForDepartment(supabase, orgId, deptId);
        if (!del.ok) {
            console.warn(`  WARN deleteActivationLifecycleForDepartment ${deptId}:`, del.error);
            const { error: hardDel } = await supabase.from("departments").delete().eq("id", deptId).eq("org_id", orgId);
            if (hardDel) console.error(`  FAIL hard delete ${deptId}:`, hardDel.message);
            else console.log(`  Hard-deleted department ${deptId}`);
        } else {
            console.log(`  Deleted builder-owned lifecycle department ${deptId}`);
        }
    }

    const { data: remaining } = await supabase
        .from("departments")
        .select("id, name, key")
        .eq("org_id", orgId);
    const simLeft = (remaining ?? []).filter((r) => isSimulationDepartmentRow(r as { name: string; key: string }));
    console.log("\n=== Done ===");
    console.log({ simulation_departments_remaining: simLeft.length, total_departments: remaining?.length ?? 0 });
    if (simLeft.length) {
        console.log("Remaining simulation rows:", simLeft);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
