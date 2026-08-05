/**
 * Deterministic Reasoning Strategy for `processing_identity_subject_resolution`.
 *
 * **This strategy does not resolve identity.** Processing's deterministic engine
 * has already formed the judgment and the Phase 1.3 adapter has already reduced
 * it to bounded, PII-free material. This strategy adapts that material into a
 * governed proposal — nothing more.
 *
 * It contains no matching rule, no weight table, no candidate scoring and no
 * record access, and it imports none: a negative control asserts the module
 * imports no matching engine and that `lib/trust` never reaches the Processing
 * identity engine.
 *
 * Confidence is `null`, not zero. The engine's bands are ordered categories, not
 * probabilities, so there IS no calibrated number — and `0` would assert zero
 * certainty, a false claim. The categorical band travels in the recommendation.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 019
 */

import {
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_DETERMINISTIC_STRATEGY_KEY,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { ReasoningEvidenceItem, ReasoningOutcome, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";

export { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_DETERMINISTIC_STRATEGY_KEY };

function readString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export const processingIdentitySubjectResolutionDeterministicStrategy: ReasoningStrategyV1 = {
    key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_DETERMINISTIC_STRATEGY_KEY,
    kind: "deterministic",
    version: "1.0.0",
    decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,

    reason({ context }): ReasoningOutcome {
        const t = context.transformed;

        const subjectRef = readString(t.subject_ref);
        const disposition = readString(t.disposition);
        const resolverVersion = readString(t.identity_resolver_version);

        // The capability declared this element; an empty one means the caller
        // handed over something the adapter never produced. That is an
        // ungrounded decision, not an uncertain one.
        if (!subjectRef || !disposition || !resolverVersion) {
            return {
                ok: false,
                refusal_code: "REASONING_UNABLE",
                detail:
                    "The prepared reasoning context carries no subject reference, disposition or resolver version, so there is no deterministic identity judgment to govern.",
            };
        }

        // A whitelist projection: only the declared element's own keys are read,
        // so nothing the adapter did not produce can travel onward.
        const recommendation = {
            subject_ref: subjectRef,
            subject_role: readString(t.subject_role),
            disposition,
            disposition_source: readString(t.disposition_source),
            review_requirement: readString(t.review_requirement),
            confidence_band: (t.confidence_band ?? null) as string | null,
            ambiguity_categories: Array.isArray(t.ambiguity_categories) ? t.ambiguity_categories : [],
            conflict_categories: Array.isArray(t.conflict_categories) ? t.conflict_categories : [],
            blocking_reason_codes: Array.isArray(t.blocking_reason_codes) ? t.blocking_reason_codes : [],
            evidence: t.evidence,
            safe_explanations: Array.isArray(t.safe_explanations) ? t.safe_explanations : [],
            adoption_id: readString(t.adoption_id),
            input_facts_hash: readString(t.input_facts_hash),
            material_projection_version: readString(t.material_projection_version),
            identity_resolver_version: resolverVersion,
        };

        const evidence: ReasoningEvidenceItem[] = [
            {
                kind: "policy",
                reference: `identity_resolver_version:${resolverVersion}`,
                detail: "Judgment produced by the Processing deterministic identity engine, which remains the sole authority on identity semantics.",
            },
            {
                kind: "deterministic_rule",
                reference: `identity_disposition:${disposition}`,
                detail: "Disposition carried through from the Processing eligibility projection without recomputation.",
            },
        ];

        const remaining: string[] = [
            "band_not_calibrated — the engine's confidence is an ordered category, not a probability, so no numeric confidence is reported.",
        ];
        if (readString(t.review_requirement) === "operator_review") {
            remaining.push("operator_review_required — a human decides this subject's identity.");
        }
        if (context.redaction_steps.length > 0) {
            remaining.push(
                `Reasoning saw a minimized context: ${context.redaction_steps.length} element(s) were transformed before reasoning.`,
            );
        }

        return {
            ok: true,
            proposal: {
                recommendation,
                // No calibrated probability exists for this class. `null`, never
                // `0` — zero would assert certainty the engine never claimed.
                confidence: null,
                evidence,
                explanation:
                    "Governed record of the Processing deterministic identity-subject resolution. No model, no provider, no external call, and no re-resolution — the judgment is Processing's, carried through unchanged.",
                remaining_uncertainty: remaining,
            },
        };
    },
};
