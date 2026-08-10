/**
 * Identity governance-gap reconciliation — the ONE canonical recovery path.
 *
 * Turns a durable subject-level gap into a governed decision, later, without
 * touching Processing. It never reruns identity matching, never rewrites the
 * resolution generation, and never reads `processing_resolutions`: the judgment
 * is replayed from the immutable snapshot recorded when capture failed.
 *
 * It calls the SAME canonical seam direct capture uses, so exactly-once is one
 * mechanism rather than two that must agree.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    captureProcessingIdentitySubjectResolution,
    type IdentityCaptureDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import {
    claimIdentityGovernanceGap,
    listUnresolvedIdentityGovernanceGaps,
    resolveIdentityGovernanceGap,
    type IdentityGovernanceGapRow,
} from "./identityGovernanceGapDb";

export type ReconcileIdentityGapOutcome =
    /** A package already existed for this adoption identity; the gap is resolved. */
    | { readonly status: "already_governed"; readonly contractId: string; readonly packageId: string }
    /** This attempt produced the governed decision; the gap is resolved. */
    | { readonly status: "resolved"; readonly contractId: string; readonly packageId: string }
    /** Another reconciler holds the claim, or the gap resolved meanwhile. */
    | { readonly status: "claim_lost" }
    /** Trust still failed. The gap stays unresolved, with retry evidence updated. */
    | { readonly status: "still_failing"; readonly reason: string };

export type ReconcileIdentityDeps = IdentityCaptureDeps & {
    readonly capture?: typeof captureProcessingIdentitySubjectResolution;
    readonly now?: () => string;
};

type Client = Pick<SupabaseClient, "from">;

/**
 * Reconcile exactly one identity gap.
 *
 * A lost claim and a still-failing Trust are outcomes, not errors. A failure of
 * the gap store itself throws, because that is the one thing a caller must not
 * mistake for progress.
 */
export async function reconcileOneIdentityGovernanceGap(
    supabase: Client,
    input: { gap: IdentityGovernanceGapRow; deps?: ReconcileIdentityDeps },
): Promise<ReconcileIdentityGapOutcome> {
    const deps = input.deps ?? {};
    const now = deps.now ?? (() => new Date().toISOString());
    const capture = deps.capture ?? captureProcessingIdentitySubjectResolution;
    const { gap } = input;
    const s = gap.snapshot;

    // ---- 1. Claim (compare-and-swap on retry_count) -------------------------
    // Taken BEFORE the capture so two reconcilers cannot both drive the same
    // gap; the seam's own pre-check is what makes an already-governed identity
    // safe, so nothing is lost by claiming first.
    const claimed = await claimIdentityGovernanceGap(supabase, { gap, nowIso: now() });
    if (!claimed) return { status: "claim_lost" };

    // ---- 2. Replay through the SAME seam direct capture uses ---------------
    const result = await capture(
        {
            org_id: gap.orgId,
            processing_case_id: gap.caseId,
            adoption_id: s.adoption_id,
            recommendation: s.recommendation as unknown as Readonly<Record<string, unknown>>,
        },
        deps,
    );

    if (result.status === "gap_required") {
        // Unresolved by design. The claim already recorded the attempt, so retry
        // evidence is correct even though this attempt produced nothing.
        return { status: "still_failing", reason: result.reason };
    }

    // ---- 3. Resolve only on an authoritative governed result ----------------
    await resolveIdentityGovernanceGap(supabase, {
        gap: claimed,
        contractId: result.contractId,
        packageId: result.packageId,
        nowIso: now(),
    });

    return {
        status: result.status === "already_governed" ? "already_governed" : "resolved",
        contractId: result.contractId,
        packageId: result.packageId,
    };
}

export type ReconcileIdentitySweepResult = {
    readonly scanned: number;
    readonly resolved: number;
    readonly alreadyGoverned: number;
    readonly claimLost: number;
    readonly stillFailing: number;
    readonly outcomes: readonly { readonly gapId: string; readonly outcome: ReconcileIdentityGapOutcome }[];
};

/**
 * Reconcile the unresolved identity gaps for one organization.
 *
 * Sequential on purpose: a recovery path, not a throughput path. No scheduler is
 * introduced — a caller decides when this runs.
 */
export async function reconcileIdentityGovernanceGaps(
    supabase: Client,
    input: { orgId: string; limit?: number; deps?: ReconcileIdentityDeps },
): Promise<ReconcileIdentitySweepResult> {
    const gaps = await listUnresolvedIdentityGovernanceGaps(supabase, {
        orgId: input.orgId,
        limit: input.limit,
    });

    const outcomes: { gapId: string; outcome: ReconcileIdentityGapOutcome }[] = [];
    for (const gap of gaps) {
        outcomes.push({
            gapId: gap.id,
            outcome: await reconcileOneIdentityGovernanceGap(supabase, { gap, deps: input.deps }),
        });
    }

    const count = (status: ReconcileIdentityGapOutcome["status"]) =>
        outcomes.filter((o) => o.outcome.status === status).length;

    return {
        scanned: gaps.length,
        resolved: count("resolved"),
        alreadyGoverned: count("already_governed"),
        claimLost: count("claim_lost"),
        stillFailing: count("still_failing"),
        outcomes,
    };
}
