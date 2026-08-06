/**
 * Lineage-gap reconciliation — the ONE canonical recovery path for supersession
 * that was owed but not recorded.
 *
 * Completes the owed observation later, without touching Processing. It never
 * reruns identity matching, never rewrites the operator decision, never rewrites
 * a resolution row and never reads `processing_resolutions` at all: the lineage
 * claim was frozen into the gap snapshot when the correction committed, and
 * re-deriving it would defeat the point of having recorded it.
 *
 * It calls the SAME Trust port the direct paths use, so exactly-once is one
 * mechanism rather than two that must agree.
 *
 * ## Two ways a gap clears
 *
 *  * `prior_package_absent` — the prior judgment's own capture gap was still
 *    open. Once Phase 1.5 reconciliation creates that package, the deferred
 *    supersession completes here. This is the ordering that lets a failed
 *    replacement capture defer, rather than falsify, lineage.
 *  * `trust_supersession_failed` — Trust was unavailable. Retry.
 *
 * A DETERMINISTIC refusal is neither: it will refuse identically forever, so the
 * gap is closed with the refusal recorded rather than left to accumulate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createSupabaseGovernedIdentityLookup,
    type GovernedIdentityLookup,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import {
    supersedeGovernedIdentityJudgment,
    type SupersedeIdentityDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import {
    observeProcessingIdentityOperatorReview,
    type ObserveReviewDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview";
import { effectForSupersessionReason } from "./identitySupersessionReasons";
import {
    abandonIdentityLineageGap,
    claimIdentityLineageGap,
    listUnresolvedIdentityLineageGaps,
    resolveIdentityLineageGap,
    type IdentityLineageGapRow,
} from "./identityLineageGapDb";

export type ReconcileLineageGapOutcome =
    /** This attempt appended the observation; the gap is resolved. */
    | { readonly status: "resolved"; readonly observationId: string }
    /** An equivalent observation already existed; the gap is resolved. */
    | { readonly status: "already_superseded"; readonly observationId: string }
    /** Another reconciler holds the claim, or the gap resolved meanwhile. */
    | { readonly status: "claim_lost" }
    /** The prior package still does not exist. The gap stays open. */
    | { readonly status: "prior_package_absent" }
    /** Trust still failed. The gap stays open, with retry evidence updated. */
    | { readonly status: "still_failing"; readonly reason: string }
    /** Deterministically refused; the gap is closed with the refusal recorded. */
    | { readonly status: "abandoned"; readonly reason: string };

export type ReconcileLineageDeps = SupersedeIdentityDeps &
    ObserveReviewDeps & {
        readonly lookup?: GovernedIdentityLookup;
        readonly supersede?: typeof supersedeGovernedIdentityJudgment;
        readonly observeReview?: typeof observeProcessingIdentityOperatorReview;
        readonly now?: () => string;
    };

type Client = Pick<SupabaseClient, "from">;

/**
 * Reconcile exactly one lineage gap.
 *
 * A lost claim, an absent prior package and a still-failing Trust are outcomes,
 * not errors. A failure of the gap store itself throws, because that is the one
 * thing a caller must not mistake for progress.
 */
export async function reconcileOneIdentityLineageGap(
    supabase: Client,
    input: { gap: IdentityLineageGapRow; deps?: ReconcileLineageDeps },
): Promise<ReconcileLineageGapOutcome> {
    const deps = input.deps ?? {};
    const now = deps.now ?? (() => new Date().toISOString());
    const lookup = deps.lookup ?? createSupabaseGovernedIdentityLookup();
    const supersede = deps.supersede ?? supersedeGovernedIdentityJudgment;
    const observeReview = deps.observeReview ?? observeProcessingIdentityOperatorReview;
    const { gap } = input;
    const s = gap.snapshot;

    // ---- 1. Claim (compare-and-swap on retry_count) -------------------------
    // Taken BEFORE the append so two reconcilers cannot both drive the same gap;
    // the port's own pre-check is what makes an already-superseded package safe,
    // so nothing is lost by claiming first.
    const claimed = await claimIdentityLineageGap(supabase, { gap, nowIso: now() });
    if (!claimed) return { status: "claim_lost" };

    // ---- 2. Resolve the prior package by its frozen adoption identity -------
    let priorPackageId = s.prior_package_id;
    if (!priorPackageId) {
        let found: { contract_id: string; package_id: string } | null;
        try {
            found = await lookup({ org_id: gap.orgId, contract_id: s.prior_adoption_id });
        } catch (e) {
            return { status: "still_failing", reason: `prior_package_lookup_failed: ${message(e)}` };
        }
        // Still not governed. The capture gap has to clear first; this one waits.
        if (!found) return { status: "prior_package_absent" };
        priorPackageId = found.package_id;
    }

    // ---- 3. The SAME ports the direct paths use -----------------------------
    // WHICH append is owed was decided when the decision committed and frozen
    // into the snapshot. Re-classifying here would let a later change to the
    // classifier silently rewrite the lifecycle of a decision that settled long
    // ago. An absent kind is a row written before confirmation was
    // distinguished from supersession, and every one of those is a supersession.
    const observationKind = s.observation_kind ?? "superseded";
    const result: { status: string; observationId?: string; reason?: string } =
        observationKind === "superseded"
            ? await supersede(
                  {
                      org_id: gap.orgId,
                      prior_package_id: priorPackageId,
                      supersession_source: s.supersession_source,
                      superseding_package_id: s.superseding_package_id,
                      superseding_reference: s.superseding_reference,
                      reason: s.reason,
                      // Preserved from the original decision, not re-derived
                      // from whoever happens to be running reconciliation.
                      actor_type: s.actor_type,
                      actor_id: s.actor_id,
                      channel: "system",
                      correlation_id: gap.caseId,
                      context: {
                          processing_case_id: gap.caseId,
                          subject_ref: s.subject_ref,
                          prior_generation_id: s.prior_generation_id,
                          ...(s.replacement_generation_id
                              ? { replacement_generation_id: s.replacement_generation_id }
                              : {}),
                      },
                  },
                  deps,
              )
            : await observeReview(
                  {
                      org_id: gap.orgId,
                      package_id: priorPackageId,
                      observation_kind: observationKind,
                      processing_reference: s.superseding_reference ?? "",
                      effect: effectForSupersessionReason(s.reason),
                      detail: {
                          processing_case_id: gap.caseId,
                          subject_ref: s.subject_ref,
                          generation_id: s.prior_generation_id,
                      },
                      actor_type: s.actor_type,
                      actor_id: s.actor_id,
                      channel: "system",
                      correlation_id: gap.caseId,
                  },
                  deps,
              );

    if (result.status === "gap_required") {
        // Unresolved by design. The claim already recorded the attempt.
        return { status: "still_failing", reason: result.reason ?? "unknown" };
    }
    if (result.status === "refused") {
        await abandonIdentityLineageGap(supabase, {
            gap: claimed,
            refusal: result.reason ?? "unknown",
            nowIso: now(),
        });
        return { status: "abandoned", reason: result.reason ?? "unknown" };
    }

    // ---- 4. Resolve only on an authoritative observation --------------------
    await resolveIdentityLineageGap(supabase, {
        gap: claimed,
        observationId: result.observationId!,
        priorPackageId,
        nowIso: now(),
    });

    // `already_superseded` (lineage port) and `already_observed` (review port)
    // are the same fact: an equivalent observation was already there.
    const alreadyThere = result.status === "already_superseded" || result.status === "already_observed";
    return {
        status: alreadyThere ? "already_superseded" : "resolved",
        observationId: result.observationId!,
    };
}

export type ReconcileLineageSweepResult = {
    readonly scanned: number;
    readonly resolved: number;
    readonly alreadySuperseded: number;
    readonly claimLost: number;
    readonly priorPackageAbsent: number;
    readonly stillFailing: number;
    readonly abandoned: number;
    readonly outcomes: readonly { readonly gapId: string; readonly outcome: ReconcileLineageGapOutcome }[];
};

/**
 * Reconcile the unresolved lineage gaps for one organization.
 *
 * Sequential on purpose: a recovery path, not a throughput path. No scheduler is
 * introduced — a caller decides when this runs.
 */
export async function reconcileIdentityLineageGaps(
    supabase: Client,
    input: { orgId: string; limit?: number; deps?: ReconcileLineageDeps },
): Promise<ReconcileLineageSweepResult> {
    const gaps = await listUnresolvedIdentityLineageGaps(supabase, {
        orgId: input.orgId,
        limit: input.limit,
    });

    const outcomes: { gapId: string; outcome: ReconcileLineageGapOutcome }[] = [];
    for (const gap of gaps) {
        outcomes.push({
            gapId: gap.id,
            outcome: await reconcileOneIdentityLineageGap(supabase, { gap, deps: input.deps }),
        });
    }

    const count = (status: ReconcileLineageGapOutcome["status"]) =>
        outcomes.filter((o) => o.outcome.status === status).length;

    return {
        scanned: gaps.length,
        resolved: count("resolved"),
        alreadySuperseded: count("already_superseded"),
        claimLost: count("claim_lost"),
        priorPackageAbsent: count("prior_package_absent"),
        stillFailing: count("still_failing"),
        abandoned: count("abandoned"),
        outcomes,
    };
}

function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
