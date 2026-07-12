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
}): void {
    console.log("--- enrollment_runtime_reset opportunity selection ---\n");
    console.log(`enrollment_work_unit_ids: ${selection.enrollmentWorkUnitIds.length ? selection.enrollmentWorkUnitIds.join(", ") : "(none)"}`);
    console.log(`selected_opportunities: ${selection.selected.length}`);
    console.log(`excluded_golden_path_opportunities: ${selection.excludedGoldenPath.length}\n`);

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
        const selection = await buildEnrollmentResetSelection(supabase, scope.orgId);
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

    const counts = await buildDemoCleanupCounts(supabase, scope, ids, orDemo);

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
