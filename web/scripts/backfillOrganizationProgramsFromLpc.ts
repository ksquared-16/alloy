#!/usr/bin/env npx tsx
/**
 * Reconcile Organization Programs from location_program_categories keys.
 *
 * Env:
 *   ORG_ID=uuid              (optional — all orgs when omitted)
 *   DRY_RUN=1                (optional — report only; default apply when unset)
 *
 * Run from repo `web/`:
 *   DRY_RUN=1 npm run dev:backfill:organization-programs-from-lpc
 *   ORG_ID=<uuid> npm run dev:backfill:organization-programs-from-lpc
 *
 * Uses toolkit-owned trusted env when available (alloy-dev-start / .env.local).
 * Does not delete legacy LPC rows. Does not manufacture publication history.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { reconcileOrganizationProgramsFromLpc } from "@/lib/programs/publication/reconcileOrganizationProgramsFromLpc";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const orgId = (process.env.ORG_ID ?? "").trim() || null;
    const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
    const supabase = createAdminClient();
    const report = await reconcileOrganizationProgramsFromLpc(supabase, { orgId, dryRun });
    console.log(
        JSON.stringify(
            {
                dry_run: report.dryRun,
                org_id: report.orgId,
                counts: report.counts,
                mappings: report.mappings,
                collisions: report.collisions,
                unresolved: report.unresolved,
                orphan_offering_keys: report.orphanOfferingKeys,
                source_classification: report.sourceClassification,
            },
            null,
            2,
        ),
    );
    if (report.counts.unresolved > 0) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
