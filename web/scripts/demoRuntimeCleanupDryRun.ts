#!/usr/bin/env npx tsx
/**
 * Phase 1 — demo/runtime cleanup DRY RUN (zero writes).
 *
 * @see docs/platform/governance/demo-runtime-cleanup-schema-audit.md
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER,
    COMMUNICATIONS_ORPHAN_RESET_MODE,
    DEMO_CLEANUP_TABLE_ORDER,
    ENROLLMENT_RUNTIME_RESET_MODE,
    PROTECTED_LOCATIONS_TABLE_KEY,
    demoMetadataOrFilter,
    parseDemoCleanupScopeFromEnv,
} from "./lib/demoRuntimeCleanupScope";
import { PROCESSING_CLEANUP_TABLE_ORDER } from "./lib/certificationBaselineSelection";
import { buildCommunicationsOrphanSelection } from "./lib/communicationsOrphanResetSelection";
import { printCommunicationsOrphanReport } from "./lib/communicationsOrphanResetExecute";
import { buildDemoCleanupCounts, buildEnrollmentResetSelection, resolveDemoIds } from "./lib/demoRuntimeCleanupPlan";
import type { EnrollmentResetOpportunityRow } from "./lib/demoRuntimeCleanupPlan";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function errMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err && typeof (err as { message: string }).message === "string") {
        return (err as { message: string }).message;
    }
    return String(err);
}

function printEnrollmentResetReport(selection: {
    selected: EnrollmentResetOpportunityRow[];
    excludedGoldenPath: EnrollmentResetOpportunityRow[];
    enrollmentWorkUnitIds: string[];
    includeClosedOpportunities: boolean;
}): void {
    console.log("--- enrollment_runtime_reset opportunity selection ---\n");
    console.log(
        selection.includeClosedOpportunities
            ? "selection_scope: EXPANDED — every opportunity in this org, OPEN AND CLOSED (--include-closed-opportunities)"
            : "selection_scope: DEFAULT — open only (lead status keys + enrollment work units)"
    );
    console.log(`enrollment_work_unit_ids: ${selection.enrollmentWorkUnitIds.length ? selection.enrollmentWorkUnitIds.join(", ") : "(none)"}`);
    console.log(`selected_opportunities: ${selection.selected.length}`);
    console.log(`excluded_golden_path_opportunities: ${selection.excludedGoldenPath.length}\n`);

    // Status/stage breakdown — with the expanded scope the single total hides which lanes are
    // being taken, and that breakdown is the thing worth checking before authorising a delete.
    const byStatus = new Map<string, number>();
    for (const row of selection.selected) {
        const key = row.status_key ?? "(null)";
        byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    if (byStatus.size) {
        console.log("selected_opportunities_by_status:");
        for (const [status, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`  ${status}: ${n}`);
        }
        console.log("");
    }

    if (selection.selected.length) {
        console.log("Selected (would delete):");
        for (const row of selection.selected) {
            console.log(
                `  - ${row.name ?? "(unnamed)"} | status=${row.status_key ?? "—"} | work_unit_id=${row.work_unit_id ?? "—"} | id=${row.id}`
            );
        }
        console.log("");
    } else {
        console.log("Selected (would delete): (none)\n");
    }

    if (selection.excludedGoldenPath.length) {
        console.log("Excluded golden-path (protected):");
        for (const row of selection.excludedGoldenPath) {
            console.log(
                `  - ${row.name ?? "(unnamed)"} | status=${row.status_key ?? "—"} | work_unit_id=${row.work_unit_id ?? "—"} | id=${row.id}`
            );
        }
        console.log("");
    }
}

async function main(): Promise<void> {
    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run: VERCEL_ENV=production");
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    const scope = parseDemoCleanupScopeFromEnv();
    const orDemo = demoMetadataOrFilter(scope);
    const supabase = createAdminClient();

    console.log("\n=== demoRuntimeCleanupDryRun (ZERO WRITES) ===\n");
    console.log(`org_id: ${scope.orgId}`);
    console.log(`cleanup_mode: ${scope.cleanupMode}`);
    if (scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE) {
        console.log("mode: enrollment_runtime_reset — deletes lead/enrollment queue runtime (not demo-metadata default)");
        console.log(
            `include_closed_opportunities: ${scope.includeClosedOpportunities ? "TRUE — EXPANDED SCOPE (open + closed)" : "false (open only)"}`
        );
        console.log(
            `certification_baseline: ${scope.certificationBaseline ? "TRUE — WIDEST SCOPE (+ unlinked identities + Processing)" : "false"}`
        );
    }
    if (scope.cleanupMode === COMMUNICATIONS_ORPHAN_RESET_MODE) {
        console.log("mode: communications_orphan_reset — deletes unlinked communication threads/messages only");
    }
    if (scope.demoSeedPackage) console.log(`filter: demo_seed_package = ${scope.demoSeedPackage}`);
    if (scope.demoSeedRunId) console.log(`filter: demo_seed_run_id = ${scope.demoSeedRunId}`);
    if (scope.demoSeedFamilyKey) console.log(`filter: demo_seed_family_key = ${scope.demoSeedFamilyKey}`);
    console.log("");

    if (scope.cleanupMode === COMMUNICATIONS_ORPHAN_RESET_MODE) {
        const selection = await buildCommunicationsOrphanSelection(supabase, scope.orgId);
        printCommunicationsOrphanReport(selection);

        console.log("--- Table-by-table counts (rows that would be deleted) ---\n");
        let total = 0;
        for (const table of COMMUNICATIONS_ORPHAN_CLEANUP_TABLE_ORDER) {
            const n = selection.counts[table as keyof typeof selection.counts] ?? 0;
            total += n;
            console.log(`${table}: ${n}`);
        }
        console.log(`\nTOTAL: ${total}`);
        console.log("\nDry-run complete. No rows deleted.\n");
        return;
    }

    if (scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE) {
        const selection = await buildEnrollmentResetSelection(supabase, scope.orgId, {
            includeClosedOpportunities: scope.includeClosedOpportunities,
        });
        printEnrollmentResetReport(selection);
    }

    const ids = await resolveDemoIds(supabase, scope, orDemo);

    if (scope.cleanupMode === ENROLLMENT_RUNTIME_RESET_MODE) {
        console.log("--- enrollment_runtime_reset shared-reference guard ---\n");
        console.log(`deletable_persons: ${ids.personIds.length}`);
        console.log(`deletable_customers: ${ids.customerIds.length}`);
        console.log(
            `preserved_shared_persons (linked to non-target records): ${ids.sharedPersonIds.length}`
        );
        console.log(
            `preserved_shared_customers (linked to non-target records): ${ids.sharedCustomerIds.length}\n`
        );
    }

    if (scope.certificationBaseline && ids.certificationSummary) {
        const s = ids.certificationSummary;
        console.log("--- certification baseline: identity classification ---\n");
        console.log(`target_customers (operational households removed): ${s.targetCustomers}`);
        console.log(`target_persons   (operational people removed):     ${s.targetPersons}`);
        console.log(`protected_customers: ${s.protectedCustomers.length}`);
        for (const p of s.protectedCustomers.slice(0, 25)) console.log(`  - ${p.id}: ${p.reason}`);
        console.log(`protected_persons:   ${s.protectedPersons.length}`);
        for (const p of s.protectedPersons.slice(0, 25)) console.log(`  - ${p.id}: ${p.reason}`);
        console.log(`\nprocessing_cases selected: ${ids.processingCaseIds?.length ?? 0}`);
        console.log(`processing_cases preserved: ${ids.preservedProcessingCases?.length ?? 0}`);
        for (const p of (ids.preservedProcessingCases ?? []).slice(0, 15)) console.log(`  - ${p.id}: ${p.reason}`);
        console.log("");
    }

    if (scope.certificationBaseline && ids.residue) {
        const r = ids.residue;
        console.log("--- A4 + subject fixes: residue classification ---\n");
        for (const [k, v] of Object.entries(r.report).sort()) console.log(`  ${k}: ${v}`);
        console.log(`\nstorage_objects to remove: ${r.storageObjects.length}`);
        console.log(`workflow_events PRESERVED as configuration history: ${r.preservedWorkflowEvents.length}`);
        const byReason = new Map<string, number>();
        for (const p of r.preservedWorkflowEvents) byReason.set(p.reason, (byReason.get(p.reason) ?? 0) + 1);
        for (const [reason, n] of byReason) console.log(`  ${n} × ${reason}`);
        console.log(`other preserved rows: ${r.preserved.length}`);
        const pr = new Map<string, number>();
        for (const p of r.preserved) pr.set(p.reason, (pr.get(p.reason) ?? 0) + 1);
        for (const [reason, n] of pr) console.log(`  ${n} × ${reason}`);
        console.log("");
    }

    const counts = await buildDemoCleanupCounts(supabase, scope, ids, orDemo);

    if (scope.certificationBaseline) {
        console.log("--- Processing graph (anchor A3) ---\n");
        let ptotal = 0;
        for (const table of PROCESSING_CLEANUP_TABLE_ORDER) {
            const v = counts[table] ?? 0;
            ptotal += v;
            console.log(`${table}: ${v}`);
        }
        console.log(`Processing subtotal: ${ptotal}\n`);
    }

    console.log("--- Table-by-table counts (rows that would be deleted) ---\n");
    let total = 0;
    for (const table of DEMO_CLEANUP_TABLE_ORDER) {
        const n = counts[table] ?? 0;
        if (table === PROTECTED_LOCATIONS_TABLE_KEY) {
            console.log(`${table}: ${n} (protected — visibility only, not deleted)`);
        } else {
            total += n;
            console.log(`${table}: ${n}`);
        }
    }
    console.log(`\nTOTAL (sum of table counts, may double-count FK-expanded rows): ${total}`);
    console.log("\nDry-run complete. No rows deleted.\n");
}

main().catch((e) => {
    console.error(errMessage(e));
    process.exit(1);
});
