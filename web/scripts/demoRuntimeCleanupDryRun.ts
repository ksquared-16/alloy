#!/usr/bin/env npx tsx
/**
 * Phase 1 — demo/runtime cleanup DRY RUN (zero writes).
 *
 * @see docs/governance/demo-runtime-cleanup-schema-audit.md
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DEMO_CLEANUP_TABLE_ORDER,
    PROTECTED_LOCATIONS_TABLE_KEY,
    demoMetadataOrFilter,
    parseDemoCleanupScopeFromEnv,
} from "./lib/demoRuntimeCleanupScope";
import { buildDemoCleanupCounts, resolveDemoIds } from "./lib/demoRuntimeCleanupPlan";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function errMessage(err: unknown): string {
    if (err && typeof err === "object" && "message" in err && typeof (err as { message: string }).message === "string") {
        return (err as { message: string }).message;
    }
    return String(err);
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
    if (scope.demoSeedPackage) console.log(`filter: demo_seed_package = ${scope.demoSeedPackage}`);
    if (scope.demoSeedRunId) console.log(`filter: demo_seed_run_id = ${scope.demoSeedRunId}`);
    if (scope.demoSeedFamilyKey) console.log(`filter: demo_seed_family_key = ${scope.demoSeedFamilyKey}`);
    console.log("");

    const ids = await resolveDemoIds(supabase, scope, orDemo);
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
