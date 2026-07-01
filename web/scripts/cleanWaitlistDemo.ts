#!/usr/bin/env npx tsx
/**
 * Remove waitlist demo batch rows (`waitlist_demo_v1`) from an org.
 *
 * Env:
 *   ORG_ID=uuid              (required)
 *   DRY_RUN=1                (default — count only)
 *   WAITLIST_DEMO_APPLY=1    (required with DRY_RUN unset to delete)
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> DRY_RUN=1 npm run dev:clean:waitlist-demo
 *   ORG_ID=<uuid> WAITLIST_DEMO_APPLY=1 npm run dev:clean:waitlist-demo
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runWaitlistDemoCleanup } from "@/lib/orchestration/placement/waitlistDemoCleanup";
import { WAITLIST_DEMO_BATCH_KEY } from "@/lib/orchestration/placement/waitlistDemoMarkers";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run waitlist demo cleanup in production");
        process.exit(1);
    }

    const dryRun = process.env.DRY_RUN !== "0" && process.env.WAITLIST_DEMO_APPLY !== "1";
    if (!dryRun && process.env.WAITLIST_DEMO_APPLY !== "1") {
        console.error("Set WAITLIST_DEMO_APPLY=1 to apply deletes (or DRY_RUN=1 for preview)");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const result = await runWaitlistDemoCleanup(supabase, orgId, !dryRun);

    console.log(
        JSON.stringify(
            {
                ...result,
                hint: dryRun
                    ? "Re-run with WAITLIST_DEMO_APPLY=1 to delete"
                    : `Deleted rows tagged demo_batch_key=${WAITLIST_DEMO_BATCH_KEY}`,
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
