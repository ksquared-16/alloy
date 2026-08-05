/**
 * Dry run for the dormant Processing identity decision class.
 *
 * Executes the **real** Trust Runtime — real registry, real strategy, real
 * privacy transform, real validation, real package construction — against the
 * canonical non-persisting repository, and returns the Decision Package in
 * memory. Nothing is written.
 *
 * **Not a production path.** No Processing caller imports this, and a structural
 * test asserts so. It exists to certify that the class composes and executes
 * before anything depends on it.
 *
 * It deliberately does NOT call the strategy directly: bypassing the runtime
 * would certify the adapter and leave the composition, privacy and validation
 * seams unproven — which is the whole point of this slice.
 */

import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import {
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createNullTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import type { TrustRuntimeStep } from "@/lib/trust/runtime/trustRuntime";

/**
 * Meaning of each element, by meaning rather than by field name.
 *
 * Every element is `operational`: a disposition, bounded categories, counts, a
 * band and Processing-authored sentences. **None is `identity`** — which is why
 * the class's privacy policy can prohibit that class outright. An
 * identity-class element reaching here would mean the adapter contract was
 * bypassed, and the transform refuses rather than minimizing.
 *
 * Keys are the FLATTENED child keys, because the runtime flattens one level of
 * declared information before classifying it.
 */
export const PROCESSING_IDENTITY_SEMANTIC_MAP: Readonly<Record<string, InformationClass>> = {
    subject_ref: "operational",
    subject_role: "operational",
    disposition: "operational",
    disposition_source: "operational",
    review_requirement: "operational",
    confidence_band: "operational",
    ambiguity_categories: "operational",
    conflict_categories: "operational",
    blocking_reason_codes: "operational",
    evidence: "operational",
    safe_explanations: "operational",
    adoption_id: "operational",
    input_facts_hash: "operational",
    material_projection_version: "operational",
    identity_resolver_version: "operational",
};

export type IdentityDryRunInput = {
    readonly org_id: string;
    readonly processing_case_id: string;
    /** The governed recommendation produced by the Phase 1.3 adapter. */
    readonly recommendation: Readonly<Record<string, unknown>>;
    readonly initiating_actor?: TrustInitiatingActor;
    readonly channel?: TrustChannel;
    /** Defaults to the NULL repository. A caller may inject a recorder to assert absence. */
    readonly repository?: TrustRepository;
    readonly nowIso?: string;
    readonly clock?: () => number;
};

export type IdentityDryRunResult = {
    readonly package: DecisionPackageV1;
    readonly step_trace: readonly TrustRuntimeStep[];
};

/**
 * Run one identity-subject judgment through the Trust Runtime without
 * persisting anything.
 *
 * Always resolves to a Decision Package: a missing element, a shape the owner's
 * parser rejects, or an unsafe value all come back as a refusal or
 * `failed_validation` package — never a thrown error.
 */
export async function dryRunProcessingIdentitySubjectResolution(
    input: IdentityDryRunInput,
): Promise<IdentityDryRunResult> {
    const repository = input.repository ?? createNullTrustRepository();

    const built = createDecisionContract({
        org_id: input.org_id,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        intent: "Record the governed judgment of the deterministic Processing identity engine for one identity subject.",
        context: {
            surface: "processing_identity_subject_resolution",
            processing_case_id: input.processing_case_id,
            subject_ref: String(input.recommendation.subject_ref ?? ""),
            // Replay pins. The adoption identity itself is derived by Processing
            // and travels in the recommendation; it is NOT used as the contract
            // id in this slice.
            input_facts_hash: String(input.recommendation.input_facts_hash ?? ""),
            material_projection_version: String(input.recommendation.material_projection_version ?? ""),
            identity_resolver_version: String(input.recommendation.identity_resolver_version ?? ""),
        },
        correlation_id: input.processing_case_id,
        initiating_actor: input.initiating_actor ?? { actor_type: "system", actor_id: null },
        channel: input.channel ?? "system",
        nowIso: input.nowIso,
    });

    const execution = await executeDecisionContract({
        contract: built.contract,
        resolvedInformation: {
            [PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY]: input.recommendation,
        },
        semanticMap: PROCESSING_IDENTITY_SEMANTIC_MAP,
        repository,
        nowIso: input.nowIso,
        clock: input.clock,
    });

    return { package: execution.package, step_trace: execution.step_trace };
}
