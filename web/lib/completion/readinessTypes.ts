/**
 * Readiness Engine — canonical contract types (v1.0).
 * @see docs/sprints/06_2026/readiness_engine_architecture_and_runtime_contract.md
 * @see docs/sprints/06_2026/required_information_v2_operational_readiness_framework.md
 */

import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";

/** Frozen additive versioning — bump only with additive optional fields. */
export const READINESS_RESULT_CONTRACT_VERSION = "1.0" as const;

export type ReadinessResultContractVersion = typeof READINESS_RESULT_CONTRACT_VERSION;

export type ReadinessPrimaryState =
    | "ready"
    | "needs_information"
    | "blocked"
    | "warning"
    | "expired";

export type ReadinessTrigger =
    | "record_view"
    | "action_execute"
    | "status_transition"
    | "form_submit"
    | "form_coverage"
    | "lifecycle_validate";

/** Config plane levels (Lifecycle Builder). */
export type RequirementConfigLevel = "off" | "suggested" | "recommended" | "required" | "enforced";

/** Runtime gap levels (Phase 1 evaluator output). */
export type RequirementLevel = "recommended" | "required" | "enforced";

export const REQUIREMENT_CONFIG_LEVELS = [
    "off",
    "suggested",
    "recommended",
    "required",
    "enforced",
] as const satisfies readonly RequirementConfigLevel[];

export const REQUIREMENT_LEVELS = [
    "recommended",
    "required",
    "enforced",
] as const satisfies readonly RequirementLevel[];

export type ReadinessScopeType = "record" | "relationship" | "packet" | "freshness";

/** Phase 1 evaluation scope — record fields only. */
export const READINESS_PHASE_1_SCOPE_TYPES = ["record"] as const satisfies readonly ReadinessScopeType[];

export type ReadinessFailureKind = "missing" | "expired" | "incomplete";

export type ReadinessGapResolution = {
    type: "field" | "action" | "form";
    action_key?: string;
    form_id?: string;
};

export type ReadinessGap = {
    requirement_id: string;
    scope_type: ReadinessScopeType;
    level: RequirementLevel;
    label: string;
    missing_reason: string;
    failure_kind: ReadinessFailureKind;
    blocking: boolean;
    entity_type?: string;
    entity_id?: string;
    field_key?: string;
    resolution?: ReadinessGapResolution;
};

export type ReadinessSubject = {
    entity_type: string;
    entity_id: string;
};

export type ReadinessContext = {
    org_id: string;
    department_id?: string;
    builder_stage_key?: string;
    operator_stage?: string;
    action_key?: string;
    status_from?: string;
    status_to?: string;
    form_id?: string;
};

export type ReadinessCounts = {
    gaps_total: number;
    by_level: { recommended: number; required: number; enforced: number };
    blocking: number;
    satisfied: number;
    configured: number;
};

export type ReadinessCompletionSummary = {
    ratio: number;
    label: string;
};

export type ReadinessResultLegacy = {
    effective_requirements?: EffectiveRequirementsResult;
};

export type ReadinessResult = {
    contract_version: ReadinessResultContractVersion;
    primary_state: ReadinessPrimaryState;
    trigger: ReadinessTrigger;
    subject: ReadinessSubject;
    context: ReadinessContext;
    gaps: ReadinessGap[];
    counts: ReadinessCounts;
    ok: boolean;
    evaluated_at?: string;
    evaluation_id?: string;
    config_fingerprint?: string;
    legacy?: ReadinessResultLegacy;
    completion_summary?: ReadinessCompletionSummary;
    bos?: {
        suggested_action_keys?: string[];
        covering_form_ids?: string[];
    };
};

export type ReadinessEvalInput = {
    org_id: string;
    trigger: ReadinessTrigger;
    subject: ReadinessSubject;
    context?: Partial<Omit<ReadinessContext, "org_id">>;
    /** When wrapping legacy evaluation — in-memory record snapshot. */
    record?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    action_key?: string | null;
    status?: string | null;
    status_from?: string | null;
    status_to?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
    configured_rule_count?: number;
    satisfied_rule_count?: number;
    include_legacy?: boolean;
};
