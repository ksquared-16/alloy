#!/usr/bin/env npx tsx
/**
 * Reconcile durable Trust governance gaps for one organization (Phase 1.1).
 *
 * A governance gap is a classification that Processing committed but Trust
 * failed to capture. This script is the narrow operable entry point to the one
 * canonical recovery path; it introduces no scheduler and no operator UI.
 *
 * It never re-runs the classifier and never writes `processing_cases` — the
 * judgment is replayed from the durable snapshot recorded when capture failed.
 *
 * Usage:
 *   npx tsx web/scripts/reconcileTrustGovernanceGaps.ts --org=<uuid> [--limit=50] [--list]
 *
 * `--list` reports the open gaps and exits without contacting the Trust Runtime.
 */

import { createClient } from "@supabase/supabase-js";
import { listUnresolvedTrustGovernanceGaps } from "../lib/pos/processingCase/classification/trustGovernanceGapDb";
import { reconcileTrustGovernanceGaps } from "../lib/pos/processingCase/classification/reconcileTrustGovernanceGaps";

const orgArg = process.argv.find((a) => a.startsWith("--org="));
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const listOnly = process.argv.includes("--list");

async function main() {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
        process.exit(1);
    }
    const orgId = orgArg?.slice("--org=".length);
    if (!orgId) {
        console.error("--org=<uuid> is required — gaps are reconciled one organization at a time");
        process.exit(1);
    }
    const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 50;

    const supabase = createClient(url, key);

    if (listOnly) {
        const gaps = await listUnresolvedTrustGovernanceGaps(supabase, { orgId, limit });
        console.log(`open governance gaps: ${gaps.length}`);
        for (const g of gaps) {
            console.log(
                `  ${g.id} case=${g.caseId} class=${g.snapshot.decision_class_key} ` +
                    `retries=${g.snapshot.retry_count} first_failed=${g.snapshot.first_failed_at} ` +
                    `reason=${g.snapshot.failure_reason}`,
            );
        }
        return;
    }

    const result = await reconcileTrustGovernanceGaps(supabase, { orgId, limit });
    console.log(
        JSON.stringify(
            {
                scanned: result.scanned,
                resolved: result.resolved,
                already_governed: result.alreadyGoverned,
                claim_lost: result.claimLost,
                still_failing: result.stillFailing,
            },
            null,
            2,
        ),
    );
    // Unresolved gaps are not a script failure — they are the expected outcome
    // while the underlying Trust problem persists. Exit non-zero only if
    // nothing could be attempted at all.
    if (result.scanned > 0 && result.resolved + result.alreadyGoverned === 0) {
        process.exitCode = 2;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
