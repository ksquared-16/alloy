#!/usr/bin/env npx tsx
/**
 * Enrollment department lifecycle_builder_v1 cleanup.
 *
 * Modes:
 * 1. Default — remove duplicate/stray processes, keep one canonical Enrollment process.
 * 2. Full clean slate — CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 removes all processes and active_process_id.
 *
 * Dry run (default):
 *   npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts
 *
 * Execute dedupe:
 *   CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1 ORG_ID=<uuid> npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts
 *
 * Execute full clear:
 *   CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1 CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 ORG_ID=<uuid> npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts
 *
 * Org: ORG_ID, SIMULATION_ORG_ID, or DEV_QUEUE_ORG_ID (first match wins).
 *
 * Does NOT delete the department row, work units, or CRM records.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    ENROLLMENT_DEPARTMENT_KEY,
    mergeEnrollmentCleanupIntoDepartmentMetadata,
    planClearAllEnrollmentLifecycleProcesses,
    planEnrollmentLifecycleProcessCleanup,
    type EnrollmentLifecycleBuilderMetadataSummary,
} from "@/lib/lifecycle/cleanupEnrollmentLifecycleProcesses";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const confirm = process.env.CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP === "1";
const clearAll = process.env.CLEAR_ALL_ENROLLMENT_LIFECYCLES === "1";
const orgId =
    process.env.ORG_ID?.trim() ??
    process.env.SIMULATION_ORG_ID?.trim() ??
    process.env.DEV_QUEUE_ORG_ID?.trim() ??
    "";

function printProcesses(label: string, rows: { id: string; key: string; name: string; stage_count: number }[]) {
    console.log(label);
    if (!rows.length) {
        console.log("  (none)");
        return;
    }
    for (const p of rows) {
        console.log(`  - ${p.name} (key=${p.key}, id=${p.id}, stages=${p.stage_count})`);
    }
}

function printMetadataSummary(label: string, summary: EnrollmentLifecycleBuilderMetadataSummary) {
    console.log(label);
    console.log(`  active_process_id: ${summary.active_process_id ?? "—"}`);
    console.log(`  process_count: ${summary.process_count}`);
    console.log(`  active_process_count: ${summary.active_process_count}`);
    printProcesses("  processes:", summary.processes);
}

function printApplyHint() {
    if (clearAll) {
        console.log(
            "\nTo apply full clear: CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1 CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 ORG_ID=" +
                orgId +
                " npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts"
        );
    } else {
        console.log(
            "\nTo apply dedupe: CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1 ORG_ID=" +
                orgId +
                " npx tsx scripts/cleanupEnrollmentLifecycleProcesses.ts"
        );
        console.log(
            "For full clean slate add: CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 (requires both flags to write)"
        );
    }
}

async function main() {
    if (!orgId) {
        console.error("Set ORG_ID, SIMULATION_ORG_ID, or DEV_QUEUE_ORG_ID.");
        process.exit(1);
    }

    const modeLabel = clearAll ? "CLEAR ALL lifecycle_builder_v1 processes" : "dedupe stray processes";
    console.log(
        confirm
            ? `=== EXECUTE Enrollment lifecycle cleanup (${modeLabel}) ===`
            : `=== DRY RUN Enrollment lifecycle cleanup (${modeLabel}) ===`
    );
    console.log({
        orgId,
        departmentKey: ENROLLMENT_DEPARTMENT_KEY,
        clearAll,
        confirm,
    });

    const supabase = createAdminClient();
    const { data: dept, error } = await supabase
        .from("departments")
        .select("id, key, name, metadata")
        .eq("org_id", orgId)
        .eq("key", ENROLLMENT_DEPARTMENT_KEY)
        .maybeSingle();

    if (error) {
        console.error(error.message);
        process.exit(1);
    }
    if (!dept) {
        console.error(`No department with key "${ENROLLMENT_DEPARTMENT_KEY}" in org ${orgId}.`);
        process.exit(1);
    }

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    const config = lifecycleBuilderFromDepartmentMetadata(metadata);

    if (clearAll) {
        const plan = planClearAllEnrollmentLifecycleProcesses(dept.id, config);
        printMetadataSummary("\n--- lifecycle_builder_v1 BEFORE ---", plan?.before ?? {
            active_process_id: config.active_process_id,
            process_count: config.processes.length,
            active_process_count: config.processes.filter((p) => p.is_active).length,
            processes: config.processes.map((p) => ({
                id: p.id,
                key: p.key,
                name: p.name,
                stage_count: p.stages.filter((s) => s.is_active).length,
                is_active: p.is_active,
            })),
        });

        if (!plan) {
            console.log("\nlifecycle_builder_v1 is already empty on Enrollment. Nothing to clear.");
            return;
        }

        printMetadataSummary("\n--- lifecycle_builder_v1 AFTER (planned) ---", plan.after);

        if (!confirm || !clearAll) {
            printApplyHint();
            return;
        }

        const nextMeta = mergeEnrollmentCleanupIntoDepartmentMetadata(metadata, plan);
        const { error: updErr } = await supabase
            .from("departments")
            .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
            .eq("id", dept.id)
            .eq("org_id", orgId);

        if (updErr) {
            console.error("Update failed:", updErr.message);
            process.exit(1);
        }

        const { data: refreshed } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", dept.id)
            .maybeSingle();
        const finalConfig = lifecycleBuilderFromDepartmentMetadata(refreshed?.metadata);

        console.log("\n=== Full clear applied ===");
        printMetadataSummary(
            "--- lifecycle_builder_v1 AFTER (persisted) ---",
            planClearAllEnrollmentLifecycleProcesses(dept.id, finalConfig)?.after ?? {
                active_process_id: finalConfig.active_process_id,
                process_count: finalConfig.processes.length,
                active_process_count: 0,
                processes: [],
            }
        );
        return;
    }

    const plan = planEnrollmentLifecycleProcessCleanup(dept.id, config);

    printProcesses(
        "\nCurrent active processes:",
        plan?.before ??
            config.processes.filter((p) => p.is_active).map((p) => ({
                id: p.id,
                key: p.key,
                name: p.name,
                stage_count: p.stages.filter((s) => s.is_active).length,
            }))
    );

    if (!plan) {
        console.log("\nNo stray or duplicate processes to remove. Enrollment metadata is already clean.");
        console.log("Use CLEAR_ALL_ENROLLMENT_LIFECYCLES=1 to remove all lifecycle_builder_v1 processes.");
        return;
    }

    console.log(`\nActive process id (before): ${plan.active_process_id_before ?? "—"}`);
    console.log(`Canonical process to keep: ${plan.keep.name} (${plan.keep.id})`);
    printProcesses("\nProcesses to remove:", plan.remove);

    if (!confirm) {
        printProcesses("\nWould remain after cleanup:", plan.after);
        printApplyHint();
        return;
    }

    const nextMeta = mergeEnrollmentCleanupIntoDepartmentMetadata(metadata, plan);
    const { error: updErr } = await supabase
        .from("departments")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", dept.id)
        .eq("org_id", orgId);

    if (updErr) {
        console.error("Update failed:", updErr.message);
        process.exit(1);
    }

    const { data: refreshed } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", dept.id)
        .maybeSingle();
    const finalConfig = lifecycleBuilderFromDepartmentMetadata(refreshed?.metadata);
    const finalActive = finalConfig.processes.filter((p) => p.is_active);

    console.log("\n=== Dedupe cleanup applied ===");
    console.log(`Active process id (after): ${finalConfig.active_process_id ?? "—"}`);
    printProcesses(
        "Final active processes:",
        finalActive.map((p) => ({
            id: p.id,
            key: p.key,
            name: p.name,
            stage_count: p.stages.filter((s) => s.is_active).length,
        }))
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
