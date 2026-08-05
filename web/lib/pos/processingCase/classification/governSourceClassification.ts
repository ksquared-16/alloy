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
 * The residual state — classified but ungoverned — is real. It is made explicit
 * rather than silent: {@link SourceClassificationGovernanceResult} names it, the
 * caller receives it, and it is logged under a single greppable marker. It is
 * never reported as success.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { decideProcessingSourceClassification } from "@/lib/trust/consumers/processingSourceClassification";
import {
    CLASSIFICATION_MATERIAL_INPUT_VERSION,
    classificationMaterialFingerprint,
} from "./classificationMaterialInput";
import { toGovernedSourceClassification } from "./governedClassificationSchema";
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
    /** One contract, one immutable package. */
    | { readonly status: "governed"; readonly package: DecisionPackageV1 }
    /**
     * Processing classified and stored; Trust did not record it. An evidence
     * gap, surfaced deliberately.
     */
    | { readonly status: "not_governed"; readonly reason: string };

export type SourceClassificationGovernanceDeps = {
    /** Injectable so certification can drive the runtime without a database. */
    readonly repository?: TrustRepository;
    readonly initiating_actor?: TrustInitiatingActor;
    readonly channel?: TrustChannel;
    readonly nowIso?: string;
    readonly clock?: () => number;
    /** Seam for certification; production uses the real consumer. */
    readonly decide?: typeof decideProcessingSourceClassification;
};

/**
 * Submits an already-final classification for governance.
 *
 * Never throws. Never mutates a Processing record — it has a Supabase client
 * only so a future slice can widen the evidence it references, and it does not
 * write with it today.
 */
export async function governSourceClassification(
    _supabase: SupabaseClient | null,
    args: {
        orgId: string;
        caseId: string;
        input: ClassifyNonFormSourceInput;
        result: ProcessingClassificationResult;
        deps?: SourceClassificationGovernanceDeps;
    },
): Promise<SourceClassificationGovernanceResult> {
    const governed = toGovernedSourceClassification(args.result);
    // `unsupported` never reaches the Trust Runtime (accepted decision 10).
    if (!governed) return { status: "skipped_unsupported" };

    const deps = args.deps ?? {};
    const decide = deps.decide ?? decideProcessingSourceClassification;

    try {
        const decision = await decide({
            org_id: args.orgId,
            processing_case_id: args.caseId,
            source_kind: args.input.sourceKind,
            classification: governed as unknown as Readonly<Record<string, unknown>>,
            material_input_fingerprint: classificationMaterialFingerprint(args.input),
            material_input_version: CLASSIFICATION_MATERIAL_INPUT_VERSION,
            classifier_version: args.result.classifier_version,
            initiating_actor: deps.initiating_actor ?? { actor_type: "system", actor_id: null },
            channel: deps.channel ?? "system",
            repository: deps.repository,
            nowIso: deps.nowIso,
            clock: deps.clock,
        });
        return { status: "governed", package: decision.package };
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        // Loud, greppable, and distinct from the classifier's own warning, so a
        // governance gap can never be mistaken for a classification failure.
        console.warn(
            `${TRUST_GOVERNANCE_GAP_MARKER} case=${args.caseId} org=${args.orgId}`,
            `classification stored but NOT governed: ${reason}`,
        );
        return { status: "not_governed", reason };
    }
}
