/**
 * Consumer adapter — processing source classification.
 *
 * The narrowest seam: Processing has already produced its classification, and
 * this adapter submits it as a Decision Contract and receives one immutable
 * Decision Package. It never classifies, never names a strategy, never names a
 * provider, and never mutates anything.
 *
 * The contract carries the IDENTITY of the material input, never its content.
 * A filename can hold a family name; its fingerprint cannot. Replay is proven
 * by the fingerprint plus the pinned classifier, runtime and registry versions.
 *
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import {
    PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
    PROCESSING_SOURCE_CLASSIFICATION_INFORMATION_KEY,
} from "@/lib/trust/capabilities/processingSourceClassification/keys";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";
import type { TrustRuntimeStep } from "@/lib/trust/runtime/trustRuntime";

/**
 * Meaning of each element, by meaning rather than by field name.
 *
 * Every element is `operational`: a category, a bounded score, a version string
 * and fixed rule tokens. None of them is identity, and none is financial — which
 * is exactly why the strict minimization policy performs no redaction here.
 *
 * Keys are the FLATTENED child keys, because the runtime flattens one level of
 * declared information before classifying it.
 */
export const PROCESSING_SOURCE_CLASSIFICATION_SEMANTIC_MAP: Readonly<Record<string, InformationClass>> = {
    classification_key: "operational",
    label: "operational",
    confidence: "operational",
    status: "operational",
    classifier_version: "operational",
    signals: "operational",
};

/**
 * What the caller hands in. The classification result is already final — this
 * adapter governs it, it does not produce it.
 */
export type ProcessingSourceClassificationDecisionInput = {
    readonly org_id: string;
    /** The case the classification annotates. Source authority, not a storage accident. */
    readonly processing_case_id: string;
    readonly source_kind: string;
    /**
     * The governed projection of the classifier's result. `null` is not
     * expressible here on purpose: an unsupported source is rejected by
     * Processing before this adapter is reached.
     */
    readonly classification: Readonly<Record<string, unknown>>;
    /** SHA-256 identity of the material classifier input. Never its content. */
    readonly material_input_fingerprint: string;
    readonly material_input_version: string;
    readonly classifier_version: string;
    readonly initiating_actor: TrustInitiatingActor;
    readonly channel: TrustChannel;
    readonly repository?: TrustRepository;
    readonly nowIso?: string;
    readonly clock?: () => number;
};

export type ProcessingSourceClassificationDecision = {
    readonly package: DecisionPackageV1;
    readonly step_trace: readonly TrustRuntimeStep[];
};

/**
 * Runs one source-classification decision through the Trust Runtime.
 *
 * Always resolves to a Decision Package. A missing element, a shape the owner's
 * parser rejects, or an out-of-range confidence all come back as a refusal or
 * `failed_validation` package — never as a thrown error, and never as a
 * silently corrected recommendation.
 *
 * Authorization is deliberately absent: this class is deterministic, at
 * escalation 0, with zero egress and `requires_allowed_feature: null`. There is
 * no AI policy to consult, and the Processing caller has already established
 * org scope and actor authority before the classification ran.
 */
export async function decideProcessingSourceClassification(
    input: ProcessingSourceClassificationDecisionInput,
): Promise<ProcessingSourceClassificationDecision> {
    const repository = input.repository ?? createSupabaseTrustRepository();

    const built = createDecisionContract({
        org_id: input.org_id,
        decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
        intent: "Record the governed judgment of the deterministic Processing source classifier for one Processing Case source.",
        context: {
            surface: "processing_source_classification",
            processing_case_id: input.processing_case_id,
            source_kind: input.source_kind,
            // Replay material: the identity of the input, and the version pins
            // that make "same input, same judgment" a checkable claim.
            material_input_fingerprint: input.material_input_fingerprint,
            material_input_version: input.material_input_version,
            classifier_version: input.classifier_version,
        },
        // One operational key retrieves every governed decision for a case.
        correlation_id: input.processing_case_id,
        initiating_actor: input.initiating_actor,
        channel: input.channel,
        nowIso: input.nowIso,
    });

    const execution = await executeDecisionContract({
        contract: built.contract,
        resolvedInformation: {
            [PROCESSING_SOURCE_CLASSIFICATION_INFORMATION_KEY]: input.classification,
        },
        semanticMap: PROCESSING_SOURCE_CLASSIFICATION_SEMANTIC_MAP,
        repository,
        nowIso: input.nowIso,
        clock: input.clock,
    });

    return { package: execution.package, step_trace: execution.step_trace };
}
