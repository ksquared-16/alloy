/**
 * Commercial Execution — Explanation graph (typed, not free-form JSON).
 *
 * Explanation is a first-class PLATFORM capability, not debug output. Every
 * resolved line answers: where did this come from, why was it selected, which
 * pricing/policy/funding applied, and what alternatives were rejected. The graph
 * is consumed by operators, Forecasting, AI, auditing, and future recommendation
 * engines — so it is strongly typed rather than `Record<string, unknown>`.
 *
 * Leaf module: imports nothing from the platform (keeps the graph reusable).
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §9.
 * Phase 2 (core types) — no logic here; builders arrive with evaluation (Phase 4).
 */

/** A pointer back to the frozen Commercial V1 entity that drove a decision. */
export type ProvenanceRef = {
    /** The V1 table/entity kind (e.g. "commercial_tuition_rates", "commercial_products"). */
    entity: string;
    /** The row id in that entity. */
    id: string;
    /** Optional human label for display (never load-bearing). */
    label?: string;
};

/** Why a candidate configuration was NOT chosen — the rejected-alternatives trail. */
export type RejectedAlternative = {
    ref: ProvenanceRef;
    /** Structured reason this alternative lost (e.g. "less_specific_scope", "not_effective", "not_offered"). */
    reason: string;
    /** Optional human detail. */
    detail?: string;
};

/** One step in a line's derivation (selection → pricing → policy → funding → accounting). */
export type ExplanationStep = {
    /** The pipeline stage that produced this step. */
    stage: "selection" | "pricing" | "policy" | "funding" | "accounting" | "rounding";
    /** What happened, in structured form. */
    summary: string;
    /** The config entity/entities this step used. */
    used: ProvenanceRef[];
    /** Alternatives considered and rejected at this step. */
    rejected?: RejectedAlternative[];
    /** Optional structured detail (amounts, rule keys, method names). */
    detail?: Record<string, string | number | boolean | null>;
};

/** The full "why does this line exist and cost this?" for a single resolved line. */
export type LineExplanation = {
    /** Ordered derivation steps for this line. */
    steps: ExplanationStep[];
    /** The primary source that originated the line (convenience; also present in steps). */
    origin: ProvenanceRef;
};

/** Resolution-level explanation: shared context + an index into per-line explanations. */
export type ResolutionExplanationGraph = {
    /** Config entities read across the whole resolution (dedup of line provenance). */
    configUsed: ProvenanceRef[];
    /** Policies evaluated at resolution scope (applied or not), for transparency. */
    policiesConsidered: { ref: ProvenanceRef; applied: boolean; reason?: string }[];
    /** Funding sources considered at resolution scope. */
    fundingConsidered: { ref: ProvenanceRef; applied: boolean; reason?: string }[];
    /** Free-form, non-load-bearing notes for humans. Never parsed by consumers. */
    notes?: string[];
};
