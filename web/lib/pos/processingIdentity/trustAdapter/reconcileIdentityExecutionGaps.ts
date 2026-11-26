/**
 * Execution-gap reconciliation — the ONE canonical recovery path for evidence
 * that was owed but not recorded.
 *
 * It completes the owed observation later without touching Processing. It never
 * reruns the executor, never reapproves a plan, never rewrites a commit attempt
 * and never reads a Processing table other than the gap store: the authoritative
 * outcome was frozen into the snapshot when the commit succeeded, and
 * re-deriving it would mean re-executing the very thing that already happened.
 *
 * That is not a stylistic preference. Re-reading the plan and recomputing the
 * evidence would let a later change to the mapping silently rewrite history for
 * a commit that has long since settled. The snapshot is the record.
 *
 * It calls the SAME Trust port the direct path uses, so exactly-once is one
 * mechanism rather than two that must agree.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    observeProcessingIdentityExecution,
    type ObserveExecutionDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution";
import {
    abandonIdentityExecutionGap,
    claimIdentityExecutionGap,
    listUnresolvedIdentityExecutionGaps,
    resolveIdentityExecutionGap,
    type IdentityExecutionGapRow,
} from "./identityExecutionGapDb";

export type ReconcileExecutionGapOutcome =
    /** This attempt appended the observation; the gap is resolved. */
    | { readonly status: "resolved"; readonly observationId: string }
    /** An equivalent observation already existed; the gap is resolved. */
    | { readonly status: "already_observed"; readonly observationId: string }
    /** Another reconciler holds the claim, or the gap resolved meanwhile. */
    | { readonly status: "claim_lost" }
    /** Trust still failed. The gap stays open, with retry evidence updated. */
    | { readonly status: "still_failing"; readonly reason: string }
    /** Deterministically refused; the gap is closed with the refusal recorded. */
    | { readonly status: "abandoned"; readonly reason: string };

export type ReconcileExecutionDeps = ObserveExecutionDeps & {
    readonly observe?: typeof observeProcessingIdentityExecution;
    readonly now?: () => string;
};

type Client = Pick<SupabaseClient, "from">;

/**
 * Reconcile exactly one execution gap.
 *
 * A lost claim and a still-failing Trust are outcomes, not errors. A failure of
 * the gap store itself throws, because that is the one thing a caller must not
 * mistake for progress.
 */
export async function reconcileOneIdentityExecutionGap(
    supabase: Client,
    input: { gap: IdentityExecutionGapRow; deps?: ReconcileExecutionDeps },
): Promise<ReconcileExecutionGapOutcome> {
    const deps = input.deps ?? {};
    const now = deps.now ?? (() => new Date().toISOString());
    const observe = deps.observe ?? observeProcessingIdentityExecution;
    const { gap } = input;
    const s = gap.snapshot;

    // ---- 1. Claim (compare-and-swap on retry_count, resolved_at IS NULL) ----
    // A gap that has already been resolved cannot be reclaimed: the same
    // statement asserts both, so a straggler finds nothing to take.
    const claimed = await claimIdentityExecutionGap(supabase, { gap, nowIso: now() });
    if (!claimed) return { status: "claim_lost" };

    // ---- 2. Replay the FROZEN evidence through the SAME port ----------------
    const result = await observe(
        {
            org_id: gap.orgId,
            package_id: s.package_id,
            observation_kind: s.observation_kind,
            commit_attempt_id: s.commit_attempt_id,
            plan_id: s.plan_id,
            plan_version: s.plan_version,
            plan_content_hash: s.plan_content_hash,
            execution_reference: s.execution_reference,
            detail: s.detail,
            // Preserved from the original binding, not re-derived from whoever
            // happens to be running reconciliation.
            actor_type: s.actor_type,
            actor_id: s.actor_id,
            channel: "system",
            correlation_id: gap.caseId,
        },
        deps,
    );

    if (result.status === "gap_required") {
        // Unresolved by design. The claim already recorded the attempt.
        return { status: "still_failing", reason: result.reason };
    }
    if (result.status === "refused") {
        await abandonIdentityExecutionGap(supabase, {
            gap: claimed,
            refusal: result.reason,
            nowIso: now(),
        });
        return { status: "abandoned", reason: result.reason };
    }

    // ---- 3. Resolve only on an authoritative observation --------------------
    await resolveIdentityExecutionGap(supabase, {
        gap: claimed,
        observationId: result.observationId,
        nowIso: now(),
    });

    return {
        status: result.status === "already_observed" ? "already_observed" : "resolved",
        observationId: result.observationId,
    };
}

export type ReconcileExecutionSweepResult = {
    readonly scanned: number;
    readonly resolved: number;
    readonly alreadyObserved: number;
    readonly claimLost: number;
    readonly stillFailing: number;
    readonly abandoned: number;
    readonly outcomes: readonly { readonly gapId: string; readonly outcome: ReconcileExecutionGapOutcome }[];
};

/**
 * Reconcile the unresolved execution gaps for one organization.
 *
 * Sequential on purpose: a recovery path, not a throughput path. No scheduler is
 * introduced — a caller decides when this runs.
 */
export async function reconcileIdentityExecutionGaps(
    supabase: Client,
    input: { orgId: string; limit?: number; deps?: ReconcileExecutionDeps },
): Promise<ReconcileExecutionSweepResult> {
    const gaps = await listUnresolvedIdentityExecutionGaps(supabase, {
        orgId: input.orgId,
        limit: input.limit,
    });

    const outcomes: { gapId: string; outcome: ReconcileExecutionGapOutcome }[] = [];
    for (const gap of gaps) {
        outcomes.push({
            gapId: gap.id,
            outcome: await reconcileOneIdentityExecutionGap(supabase, { gap, deps: input.deps }),
        });
    }

    const count = (status: ReconcileExecutionGapOutcome["status"]) =>
        outcomes.filter((o) => o.outcome.status === status).length;

    return {
        scanned: gaps.length,
        resolved: count("resolved"),
        alreadyObserved: count("already_observed"),
        claimLost: count("claim_lost"),
        stillFailing: count("still_failing"),
        abandoned: count("abandoned"),
        outcomes,
    };
}
