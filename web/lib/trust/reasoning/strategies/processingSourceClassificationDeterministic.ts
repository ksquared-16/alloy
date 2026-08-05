/**
 * Deterministic Reasoning Strategy for `processing_source_classification`.
 *
 * **This strategy does not classify.** Processing's `classifyNonFormSource` has
 * already run and is the sole authority on classification semantics; this
 * strategy adapts its finished result into a governed proposal. There is no
 * keyword, no weight and no rule table anywhere in `lib/trust`, and a negative
 * control asserts that stays true.
 *
 * Under Decision 019 a deterministic strategy executed inside an explicitly
 * submitted Decision Contract is valid Trust Runtime execution. It performs no
 * I/O, resolves no provider and sends nothing anywhere.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 019
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import {
    PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
    PROCESSING_SOURCE_CLASSIFICATION_DETERMINISTIC_STRATEGY_KEY,
} from "@/lib/trust/capabilities/processingSourceClassification/keys";
import type { ReasoningEvidenceItem, ReasoningOutcome, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";

export { PROCESSING_SOURCE_CLASSIFICATION_DETERMINISTIC_STRATEGY_KEY };

type TransformedSignal = { source?: unknown; value?: unknown; weight?: unknown };

function readString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

export const processingSourceClassificationDeterministicStrategy: ReasoningStrategyV1 = {
    key: PROCESSING_SOURCE_CLASSIFICATION_DETERMINISTIC_STRATEGY_KEY,
    kind: "deterministic",
    version: "1.0.0",
    decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,

    reason({ context }): ReasoningOutcome {
        const t = context.transformed;

        const classificationKey = readString(t.classification_key);
        const status = readString(t.status);
        const classifierVersion = readString(t.classifier_version);
        const label = readString(t.label);
        const confidence = t.confidence;

        // The capability declared this element; an empty one means the caller
        // handed over something the classifier never produced. That is an
        // ungrounded decision, not a low-confidence one.
        if (!classificationKey || !status || !classifierVersion) {
            return {
                ok: false,
                refusal_code: "REASONING_UNABLE",
                detail:
                    "The prepared reasoning context carries no classification key, status or classifier version, so there is no deterministic judgment to govern.",
            };
        }

        const signals: TransformedSignal[] = Array.isArray(t.signals) ? (t.signals as TransformedSignal[]) : [];

        // Confidence is carried through EXACTLY. It is the classifier's own
        // bounded weight sum; rescaling it here would make the governed record
        // disagree with the Processing record it exists to describe.
        const recommendation = {
            classification_key: classificationKey,
            label,
            confidence,
            status,
            classifier_version: classifierVersion,
            signals,
        };

        const evidence: ReasoningEvidenceItem[] = [
            {
                kind: "policy",
                reference: `classifier_version:${classifierVersion}`,
                detail: "Classification produced by the Processing deterministic source classifier, which remains the sole authority on classification semantics.",
            },
            ...signals.map((s) => ({
                kind: "deterministic_rule" as const,
                reference: `classification_signal:${readString(s.source)}:${readString(s.value)}`,
                detail: `Rule token matched in ${readString(s.source) || "an input field"} contributing weight ${String(s.weight ?? 0)}.`,
            })),
        ];

        const remaining: string[] =
            status === "unknown"
                ? [
                      "no_classification_rule_matched — the classifier matched no rule and reported `unknown`, which is an honest deterministic outcome rather than a failure.",
                  ]
                : [];
        if (context.redaction_steps.length > 0) {
            remaining.push(
                `Reasoning saw a minimized context: ${context.redaction_steps.length} element(s) were transformed before reasoning.`,
            );
        }

        return {
            ok: true,
            proposal: {
                recommendation,
                confidence: typeof confidence === "number" ? confidence : 0,
                evidence,
                explanation:
                    "Governed record of the Processing deterministic source classification. No model, no provider, no external call, and no reclassification — the judgment is Processing's, carried through unchanged.",
                remaining_uncertainty: remaining,
            },
        };
    },
};
