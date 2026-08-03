/**
 * Decision Package — the immutable output of the Trust Runtime.
 *
 * Immutable AT CREATION (Decision 020). There is no lifecycle field on this
 * type and none on the table: presented / accepted / rejected / overridden /
 * executed / observed are append-only observations that REFERENCE a package.
 *
 * A Decision Package is evidence. It is never directly executable.
 *
 * @see docs/platform/trust/decision-package.md
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 020
 */

import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import type { KnowledgeReference } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningEvidenceItem } from "@/lib/trust/reasoning/reasoningStrategy";
import type { TrustReviewRequirement } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { ValidationReport } from "@/lib/trust/validation/validationOrchestrator";
import type { TrustVector } from "@/lib/trust/governance/trustGovernance";

/**
 * The closed outcome set. Every refusal is a Decision Package — refusal is the
 * default, and it is never an exception or a bare error.
 */
export const DECISION_PACKAGE_OUTCOMES = [
    "recommended",
    "refused_policy",
    "refused_permission",
    "refused_unsupported_class",
    "refused_insufficient_information",
    "refused_privacy",
    "refused_budget",
    "failed_validation",
    "failed_reasoning",
] as const;

export type DecisionPackageOutcome = (typeof DECISION_PACKAGE_OUTCOMES)[number];

export function isRefusalOutcome(outcome: DecisionPackageOutcome): boolean {
    return outcome !== "recommended";
}

export type DecisionPackageEconomics = {
    readonly strategy_key: string | null;
    readonly strategy_kind: string | null;
    readonly escalation_level: number;
    readonly latency_ms: number;
    readonly cache_utilized: boolean;
    /** V1 runs no provider, so cost is structurally zero rather than unmeasured. */
    readonly provider_cost_units: 0;
};

export type DecisionPackagePrivacyReport = {
    readonly pii_mode: string;
    readonly classes_present: readonly InformationClass[];
    readonly redaction_steps: readonly { readonly path: string; readonly kind: string }[];
};

export type DecisionPackageV1 = {
    readonly schema_version: 1;
    readonly id: string;
    readonly org_id: string;
    readonly contract_id: string;
    readonly decision_class_key: string;

    readonly outcome: DecisionPackageOutcome;
    /** Present only when `outcome === "recommended"`. */
    readonly recommendation: Record<string, unknown> | null;
    /** Human-readable reason. Always present, including on refusals. */
    readonly explanation: string;
    readonly evidence: readonly ReasoningEvidenceItem[];
    readonly remaining_uncertainty: readonly string[];
    /** Statistical certainty. Never trust, never approval. */
    readonly confidence: number | null;

    readonly trust_vector: TrustVector | null;
    readonly trust_score: number | null;
    readonly trust_semantics_version: string | null;
    readonly review_requirement: TrustReviewRequirement;

    readonly validation: ValidationReport | null;
    readonly privacy_report: DecisionPackagePrivacyReport;
    readonly economics: DecisionPackageEconomics;
    readonly knowledge_versions: readonly KnowledgeReference[];

    /** Declared at creation. Outcomes arrive later as observations, never as fields here. */
    readonly learning_metadata: {
        readonly learning_policy_key: string;
        readonly eligible_for_learning: boolean;
    };

    /** Alternatives are not produced in V1. Present so the shape is stable. */
    readonly alternatives: readonly Record<string, unknown>[];

    /** Lineage: set when a materially modified recommendation produced this package. */
    readonly supersedes_package_id: string | null;

    readonly strategy_key: string | null;
    readonly strategy_version: string | null;
    readonly validation_version: string | null;
    readonly runtime_version: string;
    readonly registry_version: string;
    readonly created_at_iso: string;
};
