/**
 * Trust governance for Processing source classification (Phase 1.1).
 *
 * Processing owns the decision and its persistence. This module records the
 * governed judgment ALONGSIDE the existing write; it can neither change what
 * Processing classifies nor prevent Processing from storing it.
 *
 * ## Transaction boundary — read this before changing the order
 *
 * There is no shared transaction, and one cannot be created without a
 * cross-domain `SECURITY DEFINER` function:
 *
 *  - `dbStoreProcessingCaseClassification` issues a SELECT and an UPDATE on
 *    `processing_cases` through the CALLER's client;
 *  - the Trust repository issues its inserts through `createAdminClient()`, a
 *    fresh service-role client constructed per method call;
 *  - the Trust Runtime itself already spans four separate auto-committed
 *    statements (contract insert, lifecycle advance, package insert, usage
 *    insert), so a partially-persisted governed decision is reachable inside
 *    Phase 0's own design, independent of Processing;
 *  - `supabase-js` exposes no transaction API at all.
 *
 * So the choice is not "atomic vs not". It is "which side fails safe". Trust is
 * the additive one: a governed record that is missing is a gap in evidence,
 * while a Processing classification that is missing is a gap in the product.
 * Processing therefore writes FIRST and is never blocked by Trust.
 *
 * The residual state — classified but ungoverned — is real. It is made
 * **durably recoverable** (AD-P1-8): the gap is written to
 * `processing_exceptions` with a bounded replay snapshot, and reconciliation
 * turns it into a governed decision later. A log line is not a recovery record.
 *
 * @see ./trustGovernanceGapDb.ts — why `processing_exceptions` and not a new table
 * @see ./reconcileTrustGovernanceGaps.ts — the one canonical recovery path
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import {
    captureProcessingSourceClassification,
    decideProcessingSourceClassification,
    type GovernedDecisionLookup,
} from "@/lib/trust/consumers/processingSourceClassification";
import { PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import {
    CLASSIFICATION_MATERIAL_INPUT_VERSION,
    classificationMaterialFingerprint,
} from "./classificationMaterialInput";
import { toGovernedSourceClassification } from "./governedClassificationSchema";
import { adoptionKey, recordTrustGovernanceGap } from "./trustGovernanceGapDb";
import type { ClassifyNonFormSourceInput, ProcessingClassificationResult } from "./types";

/** The distinct log marker for a classification that was stored but not governed. */
export const TRUST_GOVERNANCE_GAP_MARKER = "[trust.governance_gap]";

/**
 * What happened to the governed record. Every branch is named; there is no
 * "probably fine" branch.
 */
export type SourceClassificationGovernanceResult =
    /** Governance was not requested by this caller. Not a failure. */
    | { readonly status: "disabled" }
    /**
     * The source kind is not classified by this layer, so no Decision Contract
     * was created. Doctrine: an unsupported source is the absence of a decision,
     * not a decision to refuse.
     */
    | { readonly status: "skipped_unsupported" }
    /**
     * One contract, one immutable package, for one adoption identity.
     *
     * `reused` is true when this call recognized an existing governed result
     * rather than creating one — a repeated classification of unchanged material
     * is the SAME decision, so it emits no second package and no second metric.
     * `package` is present only on the call that created it.
     */
    | {
          readonly status: "governed";
          readonly package: DecisionPackageV1 | null;
          readonly contractId: string;
          readonly packageId: string;
          readonly reused: boolean;
      }
    /**
     * Processing classified and stored; Trust did not. The gap is **durably
     * recorded** and recoverable by reconciliation. Not a success.
     */
    | { readonly status: "not_governed"; readonly reason: string; readonly gapId: string }
    /**
     * The loud one: Trust capture failed AND the durable gap could not be
     * written. Both the governed record and its recovery record are lost, so
     * this is the only branch that is recoverable by nothing but the log and a
     * later sweep. Processing's classification is still committed and correct.
     */
    | { readonly status: "gap_unrecordable"; readonly reason: string; readonly gapError: string };

export type SourceClassificationGovernanceDeps = {
    /** Injectable so certification can drive the runtime without a database. */
    readonly repository?: TrustRepository;
    readonly initiating_actor?: TrustInitiatingActor;
    readonly channel?: TrustChannel;
    readonly nowIso?: string;
    readonly clock?: () => number;
    /** Seam for certification; production uses the real consumer. */
    readonly decide?: typeof decideProcessingSourceClassification;
    /** Seam for certification; production uses the real Trust-record lookup. */
    readonly lookup?: GovernedDecisionLookup;
};

/**
 * Submits an already-final classification for governance, and durably records
 * the gap if that fails.
 *
 * Never throws, and never mutates a Processing record other than appending a
 * governance-gap row to `processing_exceptions`. The classification itself has
 * already committed and is untouched here.
 */
export async function governSourceClassification(
    supabase: SupabaseClient | null,
    args: {
        orgId: string;
        caseId: string;
        input: ClassifyNonFormSourceInput;
        result: ProcessingClassificationResult;
        deps?: SourceClassificationGovernanceDeps;
    },
): Promise<SourceClassificationGovernanceResult> {
    const governed = toGovernedSourceClassification(args.result);
    // `unsupported` never reaches the Trust Runtime, and never produces a gap
    // either — the absence of a decision is not a decision that went missing.
    if (!governed) return { status: "skipped_unsupported" };

    const deps = args.deps ?? {};
    const decide = deps.decide ?? decideProcessingSourceClassification;
    const now = () => deps.nowIso ?? new Date().toISOString();

    const fingerprint = classificationMaterialFingerprint(args.input);

    try {
        // The SAME seam reconciliation uses. A repeated classification of
        // unchanged material returns the existing governed result rather than
        // creating a second one.
        const capture = await captureProcessingSourceClassification(
            {
                org_id: args.orgId,
                processing_case_id: args.caseId,
                source_kind: args.input.sourceKind,
                classification: governed as unknown as Readonly<Record<string, unknown>>,
                material_input_fingerprint: fingerprint,
                material_input_version: CLASSIFICATION_MATERIAL_INPUT_VERSION,
                classifier_version: args.result.classifier_version,
                initiating_actor: deps.initiating_actor ?? { actor_type: "system", actor_id: null },
                channel: deps.channel ?? "system",
                repository: deps.repository,
                nowIso: deps.nowIso,
                clock: deps.clock,
            },
            { repository: deps.repository, lookup: deps.lookup, decide },
        );
        return {
            status: "governed",
            package: capture.package,
            contractId: capture.contractId,
            packageId: capture.packageId,
            reused: capture.reused,
        };
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);

        // ---- durable recovery record (AD-P1-8) ------------------------------
        if (!supabase) {
            console.error(
                `${TRUST_GOVERNANCE_GAP_MARKER} case=${args.caseId} org=${args.orgId}`,
                `classification stored but NOT governed and NO durable gap written (no client): ${reason}`,
            );
            return { status: "gap_unrecordable", reason, gapError: "no_supabase_client" };
        }

        try {
            const gap = await recordTrustGovernanceGap(supabase, {
                orgId: args.orgId,
                caseId: args.caseId,
                nowIso: now(),
                snapshot: {
                    adoption_key: adoptionKey({
                        orgId: args.orgId,
                        caseId: args.caseId,
                        decisionClassKey: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
                        materialInputFingerprint: fingerprint,
                        classifierVersion: args.result.classifier_version,
                    }),
                    decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
                    source_kind: args.input.sourceKind,
                    material_input_fingerprint: fingerprint,
                    material_input_version: CLASSIFICATION_MATERIAL_INPUT_VERSION,
                    classifier_version: args.result.classifier_version,
                    classification: governed,
                    failure_class: "trust_capture_failed",
                    failure_reason: reason,
                },
            });
            // Loud, greppable, and distinct from the classifier's own warning, so
            // a governance gap can never be mistaken for a classification failure.
            console.warn(
                `${TRUST_GOVERNANCE_GAP_MARKER} case=${args.caseId} org=${args.orgId} gap=${gap.id}`,
                `classification stored but NOT governed; durable gap recorded: ${reason}`,
            );
            return { status: "not_governed", reason, gapId: gap.id };
        } catch (gapError) {
            const gapReason = gapError instanceof Error ? gapError.message : String(gapError);
            // The one branch where BOTH the governed record and its recovery
            // record are lost. `error`, not `warn` — this is the loudest signal
            // this path has, and it is deliberately distinguishable.
            console.error(
                `${TRUST_GOVERNANCE_GAP_MARKER} case=${args.caseId} org=${args.orgId}`,
                `classification stored but NOT governed and the durable gap FAILED to persist.`,
                `trust=${reason} gap_store=${gapReason}`,
            );
            return { status: "gap_unrecordable", reason, gapError: gapReason };
        }
    }
}
