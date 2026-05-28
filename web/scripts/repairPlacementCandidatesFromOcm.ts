#!/usr/bin/env npx tsx
/**
 * Repair placement_candidates site/cohort from linked OCM child scope (Card 3).
 *
 * Env:
 *   ORG_ID=uuid              (required)
 *   DRY_RUN=1                (optional — counts only, no writes)
 *   LIMIT=500                (optional)
 *
 * Run from repo `web/`:
 *   ORG_ID=<uuid> DRY_RUN=1 npm run dev:repair:placement-candidates
 *   ORG_ID=<uuid> npm run dev:repair:placement-candidates
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runPlacementCandidateOcmRepair } from "@/lib/orchestration/placement/repair/placementCandidateOcmRepair";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
    const limitRaw = process.env.LIMIT?.trim();
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    const supabase = createAdminClient();
    const { counts, error_messages } = await runPlacementCandidateOcmRepair(supabase, {
        orgId,
        dryRun,
        limit: Number.isFinite(limit) ? limit : undefined,
    });

    console.log(JSON.stringify({ dry_run: dryRun, org_id: orgId, counts, error_messages }, null, 2));
    if (counts.errors > 0) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
