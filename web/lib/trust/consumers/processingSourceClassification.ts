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

import { createAdminClient } from "@/lib/supabaseAdmin";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import {
    PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
    PROCESSING_SOURCE_CLASSIFICATION_INFORMATION_KEY,
} from "@/lib/trust/capabilities/processingSourceClassification/keys";
import {
    processingSourceClassificationContractId,
    type ProcessingSourceClassificationAdoptionIdentity,
} from "@/lib/trust/capabilities/processingSourceClassification/adoptionIdentity";
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
 * The identity that answers "has this exact judgment already been governed?".
 *
 * The `decision_class_key` component of the ratified five is implicit: this
 * lookup is scoped to `processing_source_classification` and filters on it.
 */
export type GovernedDecisionIdentity = {
    readonly org_id: string;
    readonly processing_case_id: string;
    readonly material_input_fingerprint: string;
    readonly classifier_version: string;
};

/** Widens a lookup identity to the full five-component adoption identity. */
export function toAdoptionIdentity(
    identity: GovernedDecisionIdentity,
): ProcessingSourceClassificationAdoptionIdentity {
    return {
        org_id: identity.org_id,
        processing_case_id: identity.processing_case_id,
        decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
        material_input_fingerprint: identity.material_input_fingerprint,
        classifier_version: identity.classifier_version,
    };
}

export type GovernedDecisionReference = {
    readonly contract_id: string;
    readonly package_id: string;
};

/**
 * Looks up an already-governed decision by adoption identity.
 *
 * This is the IDEMPOTENCY seam, and it deliberately lives in `lib/trust`:
 * Processing must never query a `trust_` table, and a structural control
 * asserts it does not. It is also NOT a way for Processing to read its
 * operational classification — that remains `processing_cases.metadata`. This
 * answers one question only: was a package already produced for this identity?
 */
export type GovernedDecisionLookup = (
    identity: GovernedDecisionIdentity,
) => Promise<GovernedDecisionReference | null>;

/**
 * The production lookup, over existing Trust records.
 *
 * No new idempotency store: `trust_decision_packages.contract_id` is already
 * UNIQUE, so one contract can carry at most one package. The contract's own
 * declared context carries the fingerprint and classifier version, and
 * `correlation_id` is the Processing Case id (indexed by `idx_tdc_correlation`).
 * Together those are the adoption identity, already persisted.
 */
export function createSupabaseGovernedDecisionLookup(): GovernedDecisionLookup {
    return async (identity) => {
        const admin = createAdminClient();
        const { data: contracts, error: contractError } = await admin
            .from("trust_decision_contracts")
            .select("id")
            .eq("org_id", identity.org_id)
            .eq("decision_class_key", PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY)
            .eq("correlation_id", identity.processing_case_id)
            .eq("context->>material_input_fingerprint", identity.material_input_fingerprint)
            .eq("context->>classifier_version", identity.classifier_version);
        if (contractError) throw new Error(`trust.governedDecisionLookup: ${contractError.message}`);

        const contractIds = ((contracts ?? []) as { id: string }[]).map((c) => c.id);
        if (contractIds.length === 0) return null;

        const { data: packages, error: packageError } = await admin
            .from("trust_decision_packages")
            .select("id, contract_id")
            .eq("org_id", identity.org_id)
            .in("contract_id", contractIds)
            .limit(1);
        if (packageError) throw new Error(`trust.governedDecisionLookup: ${packageError.message}`);

        const found = ((packages ?? []) as { id: string; contract_id: string }[])[0];
        return found ? { contract_id: found.contract_id, package_id: found.id } : null;
    };
}

/**
 * A lookup that never finds anything.
 *
 * Mirrors `createNullTrustRepository`, for callers that must not read — unit
 * tests and dry runs. Using it in production would disable idempotency, which
 * is why it is named for what it does rather than offered as a default.
 */
export function createNullGovernedDecisionLookup(): GovernedDecisionLookup {
    return async () => null;
}

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
        // Deterministic: one adoption identity yields one contract id, so the
        // contract table's primary key refuses a duplicate governed decision.
        id: processingSourceClassificationContractId({
            org_id: input.org_id,
            processing_case_id: input.processing_case_id,
            decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
            material_input_fingerprint: input.material_input_fingerprint,
            classifier_version: input.classifier_version,
        }),
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

// ---------------------------------------------------------------------------
// The canonical lookup-or-capture seam
// ---------------------------------------------------------------------------

/**
 * One governed result for one adoption identity.
 *
 * `reused` distinguishes "we created this" from "this already existed", which is
 * what lets a caller know whether a metric was emitted without counting rows.
 */
export type GovernedCaptureResult = {
    readonly contractId: string;
    readonly packageId: string;
    /** Present only when this call created it. A reuse returns identifiers. */
    readonly package: DecisionPackageV1 | null;
    readonly reused: boolean;
};

export type CaptureDeps = {
    readonly repository?: TrustRepository;
    readonly lookup?: GovernedDecisionLookup;
    readonly decide?: typeof decideProcessingSourceClassification;
};

/**
 * **The one seam.** Look up an already-governed result; create one only if none
 * exists; resolve a concurrent create race by returning the winner.
 *
 * Used by all three paths — direct classification capture, governance-gap
 * reconciliation, and ambiguous-success recovery — so the adoption identity is
 * constructed once and interpreted the same way everywhere.
 *
 * Three layers, cheapest first:
 *
 *  1. **Pre-check.** A read that avoids the exception path in the common case.
 *  2. **Deterministic contract id.** A concurrent second create collides on the
 *     contract table's PRIMARY KEY, so the database serializes the race instead
 *     of a check-then-act window doing it badly.
 *  3. **Post-conflict resolve.** The loser re-reads and returns the winner, so
 *     both callers converge on one governed result.
 */
export async function captureProcessingSourceClassification(
    input: ProcessingSourceClassificationDecisionInput,
    deps: CaptureDeps = {},
): Promise<GovernedCaptureResult> {
    const lookup = deps.lookup ?? createSupabaseGovernedDecisionLookup();
    const decide = deps.decide ?? decideProcessingSourceClassification;
    const identity: GovernedDecisionIdentity = {
        org_id: input.org_id,
        processing_case_id: input.processing_case_id,
        material_input_fingerprint: input.material_input_fingerprint,
        classifier_version: input.classifier_version,
    };

    const existing = await lookup(identity);
    if (existing) {
        return {
            contractId: existing.contract_id,
            packageId: existing.package_id,
            package: null,
            reused: true,
        };
    }

    try {
        const decision = await decide({ ...input, repository: deps.repository ?? input.repository });
        return {
            contractId: decision.package.contract_id,
            packageId: decision.package.id,
            package: decision.package,
            reused: false,
        };
    } catch (e) {
        // A create that raced another create for the SAME identity lost on the
        // contract table's primary key. That is not a failure — the decision
        // exists, or is landing, and someone else owns it.
        //
        // Re-read: if the winner has already stored its package, return it and
        // both callers converge immediately.
        const winner = await lookup(identity);
        if (winner) {
            return {
                contractId: winner.contract_id,
                packageId: winner.package_id,
                package: null,
                reused: true,
            };
        }
        // Otherwise the winner is mid-flight: its contract exists, its package
        // does not yet. Rethrowing is the SAFE outcome, not a defect — the
        // caller records a durable gap, and reconciliation's own pre-check
        // later finds the winner's package and resolves without duplicating.
        // Convergence is eventual and durable; a duplicate is never created.
        // (This branch also carries every genuine failure, which must propagate.)
        throw e;
    }
}
