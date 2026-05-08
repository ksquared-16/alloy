/**
 * Placement priority evaluator types (Card 3).
 * Source of truth: docs/sprints/05_2026/priority_placement_orchestration_may_2026.md § Card 2.
 */

export type FactPresence = "present" | "absent" | "unknown";

/** Optional `source` documents where the adapter derived the fact (explainability; evaluator ignores it). */
export type FactValue =
    | { presence: "present"; value: string | number | boolean | null; source?: string }
    | { presence: "absent"; source?: string }
    | { presence: "unknown"; source?: string };

export type FactBag = Record<string, FactValue>;

export type PlacementEvaluateInput = {
    evaluator_version: string;
    now_ms: number;
    entity: { entity_type: string; entity_id: string };
    cohort: {
        work_unit_id: string;
        queue_key: string;
        status_keys_allowed?: string[];
    };
    facts: FactBag;
    profile: PlacementProfile;
    locale?: string;
};

export type PlacementPrioritySnapshot = {
    schema_version: 1;
    evaluator_version: string;
    profile_id: string;
    profile_revision: string;
    evaluated_at_ms: number;
    bucket_key: string;
    bucket_priority_order: number;
    bucket_label: string;
    sort_tuple: Array<string | number | null>;
    fact_digest?: string;
    /** Present when profile {@link PlacementProfile.primary_group_fact_key} is set — raw display label from facts. */
    program_room_group_label?: string | null;
};

export type PlacementReason = {
    code: string;
    bucket_key?: string;
    fact_refs?: string[];
    label: string;
    detail?: Record<string, string | number | boolean | null>;
};

export type TieBreakerTraceStep = {
    tie_breaker_index: number;
    field: string;
    direction: "asc" | "desc";
    resolved_a: string | number | null;
    resolved_b: string | number | null;
};

export type PlacementEvaluateOk = {
    snapshot: PlacementPrioritySnapshot;
    reasons: PlacementReason[];
    tie_breaker_trace: TieBreakerTraceStep[];
    warnings: Array<{ code: string; message: string; fact_keys?: string[] }>;
};

export type PlacementEvaluateErr = {
    ok: false;
    code: "INVALID_PROFILE" | "UNSUPPORTED_COHORT" | "FACT_CONSTRAINT_VIOLATION";
    message: string;
    details?: Record<string, unknown>;
};

export type PlacementEvaluateResult = { ok: true; value: PlacementEvaluateOk } | PlacementEvaluateErr;

export type FactPredicate =
    | { all: FactPredicate[] }
    | { any: FactPredicate[] }
    | { not: FactPredicate }
    | { fact_eq: { key: string; value: string | number | boolean } }
    | { fact_in: { key: string; values: string[] } }
    | { fact_present: { key: string } };

export type PlacementProfile = {
    profile_id: string;
    revision: string;
    domain: string;
    buckets: Array<{ bucket_key: string; priority_order: number; label_key: string }>;
    rules: Array<{ rule_order: number; when: FactPredicate; assign_bucket_key: string }>;
    fallback_bucket_key: string;
    tie_breakers: Array<{ kind: "fact"; field: string; direction: "asc" | "desc" }>;
    labels: Record<string, string>;
    cohort_filter?: { queue_keys?: string[]; status_keys?: string[] };
    /** If true, missing required facts yields FACT_CONSTRAINT_VIOLATION. */
    strict_required_facts?: boolean;
    required_fact_keys?: string[];
    /** Emit warnings when these keys are `unknown` (config-driven; presets may list sibling flags). */
    warn_if_unknown_fact_keys?: string[];
    /**
     * When set, projection sort prepends this fact (ascending, missing-values sort last) before bucket priority.
     * Config-driven — evaluator does not interpret domain semantics.
     */
    primary_group_fact_key?: string;
};
