/**
 * Trust governance-gap reconciliation — the ONE canonical recovery path.
 *
 * Turns a durable gap into a governed decision, later, without touching
 * Processing. It never re-runs the classifier, never writes
 * `processing_cases`, and never produces a second Processing classification
 * mutation: the judgment is replayed from the immutable snapshot recorded when
 * the capture failed.
 *
 * ## Ordering (AD-P1-8, ratified)
 *
 * ```text
 * Processing classification commits
 *   → Trust capture attempted
 *   → on failure, a durable Processing-owned gap is recorded
 *   → reconciliation retries idempotently
 * ```
 *
 * The ordering is never reversed and Processing is never blocked on Trust.
 *
 * ## Exactly-once, without a second idempotency store
 *
 * Two independent guards, both over facilities that already exist:
 *
 *  1. **Pre-check.** Before creating anything, ask Trust whether this adoption
 *     identity already has a package. `trust_decision_packages.contract_id` is
 *     UNIQUE, so this is authoritative. It covers the ambiguous-network case
 *     where the capture actually succeeded but the response was lost.
 *  2. **Compare-and-swap claim.** A single conditional UPDATE on the observed
 *     `retry_count` means two concurrent reconcilers cannot both proceed.
 *
 * A gap is marked resolved ONLY after Trust returns a package.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    decideProcessingSourceClassification,
    createSupabaseGovernedDecisionLookup,
    type GovernedDecisionLookup,
} from "@/lib/trust/consumers/processingSourceClassification";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import {
    claimTrustGovernanceGap,
    listUnresolvedTrustGovernanceGaps,
    resolveTrustGovernanceGap,
    type TrustGovernanceGapRow,
} from "./trustGovernanceGapDb";

export type ReconcileOneOutcome =
    /** A package already existed for this adoption identity; the gap is now resolved. */
    | { readonly status: "already_governed"; readonly contractId: string; readonly packageId: string }
    /** This attempt produced the governed decision; the gap is now resolved. */
    | { readonly status: "resolved"; readonly contractId: string; readonly packageId: string }
    /** Another reconciler holds the claim, or the gap resolved meanwhile. */
    | { readonly status: "claim_lost" }
    /** Trust still failed. The gap stays unresolved, with retry evidence updated. */
    | { readonly status: "still_failing"; readonly reason: string };

export type ReconcileDeps = {
    readonly repository?: TrustRepository;
    readonly lookup?: GovernedDecisionLookup;
    readonly decide?: typeof decideProcessingSourceClassification;
    readonly initiating_actor?: TrustInitiatingActor;
    readonly channel?: TrustChannel;
    readonly now?: () => string;
    readonly clock?: () => number;
};

type Client = Pick<SupabaseClient, "from">;

/**
 * Reconcile exactly one gap.
 *
 * Never throws for an expected condition — a lost claim and a still-failing
 * Trust are outcomes, not errors. A failure of the gap store itself does throw,
 * because that is the one thing the caller must not mistake for progress.
 */
export async function reconcileOneTrustGovernanceGap(
    supabase: Client,
    input: { gap: TrustGovernanceGapRow; deps?: ReconcileDeps },
): Promise<ReconcileOneOutcome> {
    const deps = input.deps ?? {};
    const now = deps.now ?? (() => new Date().toISOString());
    const lookup = deps.lookup ?? createSupabaseGovernedDecisionLookup();
    const decide = deps.decide ?? decideProcessingSourceClassification;
    const { gap } = input;
    const s = gap.snapshot;

    const identity = {
        org_id: gap.orgId,
        processing_case_id: gap.caseId,
        material_input_fingerprint: s.material_input_fingerprint,
        classifier_version: s.classifier_version,
    };

    // ---- 1. Pre-check: is this already governed? ----------------------------
    // Authoritative, because contract_id is UNIQUE on the package table. This is
    // what makes a retry after an ambiguous failure safe.
    const existing = await lookup(identity);
    if (existing) {
        await resolveTrustGovernanceGap(supabase, {
            gap,
            contractId: existing.contract_id,
            packageId: existing.package_id,
            nowIso: now(),
        });
        return {
            status: "already_governed",
            contractId: existing.contract_id,
            packageId: existing.package_id,
        };
    }

    // ---- 2. Claim (compare-and-swap on retry_count) -------------------------
    const claimed = await claimTrustGovernanceGap(supabase, { gap, nowIso: now() });
    if (!claimed) return { status: "claim_lost" };

    // ---- 3. Replay the judgment from the snapshot --------------------------
    // The classifier is NOT re-run and `processing_cases` is NOT read: the
    // stored classification is the judgment, and re-deriving it would defeat
    // the point of having recorded it.
    let decision;
    try {
        decision = await decide({
            org_id: gap.orgId,
            processing_case_id: gap.caseId,
            source_kind: s.source_kind,
            classification: s.classification as unknown as Readonly<Record<string, unknown>>,
            material_input_fingerprint: s.material_input_fingerprint,
            material_input_version: s.material_input_version,
            classifier_version: s.classifier_version,
            initiating_actor: deps.initiating_actor ?? { actor_type: "system", actor_id: null },
            channel: deps.channel ?? "system",
            repository: deps.repository,
            clock: deps.clock,
        });
    } catch (e) {
        // Unresolved by design. The claim already recorded the attempt, so retry
        // evidence is correct even though this attempt produced nothing.
        return { status: "still_failing", reason: e instanceof Error ? e.message : String(e) };
    }

    // ---- 4. Resolve only on authoritative Trust success ---------------------
    await resolveTrustGovernanceGap(supabase, {
        gap: claimed,
        contractId: decision.package.contract_id,
        packageId: decision.package.id,
        nowIso: now(),
    });

    return {
        status: "resolved",
        contractId: decision.package.contract_id,
        packageId: decision.package.id,
    };
}

export type ReconcileSweepResult = {
    readonly scanned: number;
    readonly resolved: number;
    readonly alreadyGoverned: number;
    readonly claimLost: number;
    readonly stillFailing: number;
    readonly outcomes: readonly { readonly gapId: string; readonly outcome: ReconcileOneOutcome }[];
};

/**
 * Reconcile the unresolved gaps for one organization.
 *
 * Sequential on purpose: this is a recovery path, not a throughput path, and
 * serial execution keeps the retry evidence legible. No scheduler is introduced
 * — a caller (a script, or an existing retry hook) decides when this runs.
 */
export async function reconcileTrustGovernanceGaps(
    supabase: Client,
    input: { orgId: string; limit?: number; deps?: ReconcileDeps },
): Promise<ReconcileSweepResult> {
    const gaps = await listUnresolvedTrustGovernanceGaps(supabase, {
        orgId: input.orgId,
        limit: input.limit,
    });

    const outcomes: { gapId: string; outcome: ReconcileOneOutcome }[] = [];
    for (const gap of gaps) {
        outcomes.push({
            gapId: gap.id,
            outcome: await reconcileOneTrustGovernanceGap(supabase, { gap, deps: input.deps }),
        });
    }

    const count = (status: ReconcileOneOutcome["status"]) =>
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
