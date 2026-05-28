#!/usr/bin/env npx tsx
/**
 * Dry-run / apply cleanup for legacy waitlist/placement demo rows beyond `waitlist_demo_v1`.
 *
 * Env:
 *   ORG_ID=uuid              (required)
 *   DRY_RUN=1                (default — report only)
 *   LEGACY_WAITLIST_APPLY=1  (required with DRY_RUN unset to delete)
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> DRY_RUN=1 npm run dev:clean:legacy-waitlist-demo
 *   ORG_ID=<uuid> LEGACY_WAITLIST_APPLY=1 npm run dev:clean:legacy-waitlist-demo
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runLegacyWaitlistDemoCleanupReport } from "@/lib/orchestration/placement/legacyWaitlistDemoCleanup";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run legacy waitlist demo cleanup in production");
        process.exit(1);
    }

    const dryRun = process.env.DRY_RUN !== "0" && process.env.LEGACY_WAITLIST_APPLY !== "1";
    if (!dryRun && process.env.LEGACY_WAITLIST_APPLY !== "1") {
        console.error("Set LEGACY_WAITLIST_APPLY=1 to apply deletes (or DRY_RUN=1 for preview)");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const report = await runLegacyWaitlistDemoCleanupReport(supabase, orgId, !dryRun);

    console.log(
        JSON.stringify(
            {
                ...report,
                hint: dryRun
                    ? "Re-run with LEGACY_WAITLIST_APPLY=1 to delete legacy name-pattern rows (untagged only)"
                    : "Applied legacy cleanup + waitlist_demo_v1 batch",
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
