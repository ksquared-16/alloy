#!/usr/bin/env npx tsx
/**
 * Apply OCM lifecycle backfill recommendations from strict-mode audit (Card 12).
 *
 * Default: dry-run (no writes). Pass --apply to mutate outcome_status_key via canonical helper.
 *
 * Env:
 *   ORG_ID=uuid              (required)
 *
 * Run from repo `web/`:
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/backfillOcmLifecycleFromRecommendations.ts
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/backfillOcmLifecycleFromRecommendations.ts --apply
 *
 * Does not delete placement candidates or sync opportunity.status_key.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runOcmLifecycleStrictModeAudit } from "@/lib/opportunities/runOcmLifecycleStrictModeAudit";
import {
    filterApplicableOcmBackfillRecommendations,
    type OcmLifecycleBackfillRecommendation,
} from "@/lib/opportunities/ocmLifecycleStrictModeReadiness";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type ApplyCounts = {
    dry_run: boolean;
    audit_recommendations_total: number;
    applicable_recommendations: number;
    applied: number;
    skipped: number;
    errors: number;
    by_kind: Record<string, number>;
};

async function applyRecommendation(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    rec: OcmLifecycleBackfillRecommendation,
    dryRun: boolean
): Promise<{ ok: boolean; error?: string }> {
    const next = rec.suggested_outcome_status_key?.trim();
    if (!next) return { ok: false, error: "no suggested status" };

    if (dryRun) return { ok: true };

    const result = await updateOpportunityCustomerMemberLifecycleStatus({
        supabase,
        orgId,
        opportunityId: rec.opportunity_id,
        opportunityCustomerMemberId: rec.ocm_id,
        nextStatusKey: next,
        source: "script:backfillOcmLifecycleFromRecommendations",
        reason: rec.reason,
        runPlacementHook: true,
    });

    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
}

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    const apply = process.argv.includes("--apply");
    const dryRun = !apply;

    const supabase = createAdminClient();
    const audit = await runOcmLifecycleStrictModeAudit(supabase, orgId);
    const applicable = filterApplicableOcmBackfillRecommendations(audit.recommendations);

    const counts: ApplyCounts = {
        dry_run: dryRun,
        audit_recommendations_total: audit.recommendations.length,
        applicable_recommendations: applicable.length,
        applied: 0,
        skipped: 0,
        errors: 0,
        by_kind: {},
    };

    const results: Array<{ ocm_id: string; kind: string; suggested: string | null; ok: boolean; error?: string }> =
        [];

    for (const rec of applicable) {
        counts.by_kind[rec.kind] = (counts.by_kind[rec.kind] ?? 0) + 1;
        const res = await applyRecommendation(supabase, orgId, rec, dryRun);
        results.push({
            ocm_id: rec.ocm_id,
            kind: rec.kind,
            suggested: rec.suggested_outcome_status_key,
            ok: res.ok,
            error: res.error,
        });
        if (res.ok) counts.applied += 1;
        else {
            counts.errors += 1;
        }
    }

    counts.skipped = audit.recommendations.length - applicable.length;

    console.log(
        JSON.stringify(
            {
                org_id: orgId,
                counts,
                strict_mode_ready_before: audit.strict_mode_ready,
                strict_mode_blocker_summary: audit.strict_mode_blocker_summary,
                results,
            },
            null,
            2
        )
    );

    if (counts.errors > 0) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
