#!/usr/bin/env npx tsx
/**
 * Remove builder-owned test lifecycle departments (e.g. Admissions Test).
 *
 * Dry run:
 *   npx tsx scripts/cleanupTestLifecycleDepartments.ts
 *
 * Execute:
 *   CONFIRM_TEST_LIFECYCLE_CLEANUP=1 npx tsx scripts/cleanupTestLifecycleDepartments.ts
 *
 * Optional: SIMULATION_ORG_ID or uses org from .env context via first admin org lookup — prefer SIMULATION_ORG_ID.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { cleanupTestLifecyclesForOrg } from "@/lib/lifecycle/cleanupTestLifecycles";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const execute = process.env.CONFIRM_TEST_LIFECYCLE_CLEANUP === "1";
const orgId = process.env.SIMULATION_ORG_ID?.trim() ?? process.env.ORG_ID?.trim() ?? "";

async function main() {
    if (!orgId) {
        console.error("Set SIMULATION_ORG_ID or ORG_ID to target org.");
        process.exit(1);
    }

    console.log(execute ? "=== EXECUTE test lifecycle cleanup ===" : "=== DRY RUN test lifecycle cleanup ===");
    console.log({ orgId });

    const supabase = createAdminClient();
    const result = await cleanupTestLifecyclesForOrg(supabase, orgId, { dry_run: !execute });

    for (const row of result.removed) {
        console.log(
            `  - ${row.name} (${row.department_id})${execute ? (row.deleted ? " deleted" : ` FAILED: ${row.error}`) : " [preview]"}`
        );
    }
    if (!result.removed.length) {
        console.log("No test lifecycles matched.");
    }
    if (!execute && result.removed.length) {
        console.log("\nTo delete, run: CONFIRM_TEST_LIFECYCLE_CLEANUP=1 SIMULATION_ORG_ID=" + orgId + " npx tsx scripts/cleanupTestLifecycleDepartments.ts");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
