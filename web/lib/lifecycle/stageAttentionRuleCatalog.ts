/**
 * Operator-facing attention rule catalog for stage_operating_plan_v1 editor.
 */

import type { StageAttentionRuleKind, StageAttentionRuleV1, StageAttentionSeverity } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageAttentionRuleCatalogEntry = {
    kind: StageAttentionRuleKind;
    label: string;
    description: string;
    /** Legacy: numeric threshold without units (attempts or days). */
    supportsThreshold: boolean;
    /** Elapsed-time rules use shared value + unit duration controls. */
    supportsDuration: boolean;
    defaultThreshold: number;
    defaultSeverity: StageAttentionSeverity;
    /** When false, rule may be saved but is not evaluated by stage-plan attention runtime. */
    evaluatorSupported?: boolean;
    unsupportedReason?: string;
};

/** Canonical editor kinds — legacy kinds normalize to these on display. */
export const STAGE_ATTENTION_RULE_CATALOG: StageAttentionRuleCatalogEntry[] = [
    {
        kind: "work_overdue",
        label: "Work overdue",
        description: "Required work passed its due date without a successful outcome.",
        supportsThreshold: false,
        supportsDuration: true,
        defaultThreshold: 1,
        defaultSeverity: "medium",
    },
    {
        kind: "stage_age_exceeded",
        label: "Stage age exceeded",
        description: "Record has remained in this stage longer than expected.",
        supportsThreshold: false,
        supportsDuration: true,
        defaultThreshold: 7,
        defaultSeverity: "medium",
    },
    {
        kind: "missing_requirements",
        label: "Missing requirements",
        description: "Active stage requirements (fields, facts, or work) are incomplete.",
        supportsThreshold: false,
        supportsDuration: false,
        defaultThreshold: 0,
        defaultSeverity: "high",
    },
    {
        kind: "no_contact_attempt",
        label: "No contact attempt",
        description: "Fewer successful contact attempts than required after the stage window.",
        supportsThreshold: true,
        supportsDuration: false,
        defaultThreshold: 3,
        defaultSeverity: "medium",
    },
    {
        kind: "waiting_on_family",
        label: "Waiting on family",
        description: "Progress blocked waiting for family response or action.",
        supportsThreshold: false,
        supportsDuration: true,
        defaultThreshold: 3,
        defaultSeverity: "low",
        evaluatorSupported: false,
        unsupportedReason:
            "Requires enrollment_operational.wait_bucket — configure via outcome automation or org-wide attention until stage-plan evaluation is wired.",
    },
    {
        kind: "waiting_on_provider",
        label: "Waiting on provider",
        description: "Progress blocked waiting for internal staff action.",
        supportsThreshold: false,
        supportsDuration: true,
        defaultThreshold: 2,
        defaultSeverity: "low",
        evaluatorSupported: false,
        unsupportedReason:
            "Maps to waiting_on_staff wait bucket — not yet evaluated from stage attention rules. Use org-wide attention or outcome automation.",
    },
];

const LEGACY_KIND_MAP: Partial<Record<StageAttentionRuleKind, StageAttentionRuleKind>> = {
    tasks_without_success: "no_contact_attempt",
    days_without_success: "stage_age_exceeded",
    required_work_overdue: "work_overdue",
    missing_required_fields: "missing_requirements",
};

export function normalizeAttentionRuleKind(kind: StageAttentionRuleKind): StageAttentionRuleKind {
    return LEGACY_KIND_MAP[kind] ?? kind;
}

export function catalogEntryForAttentionKind(
    kind: StageAttentionRuleKind,
): StageAttentionRuleCatalogEntry | null {
    const normalized = normalizeAttentionRuleKind(kind);
    return STAGE_ATTENTION_RULE_CATALOG.find((e) => e.kind === normalized) ?? null;
}

export function defaultAttentionRuleLabel(kind: StageAttentionRuleKind): string {
    return catalogEntryForAttentionKind(kind)?.label ?? kind.replace(/_/g, " ");
}

export function isStageAttentionRuleEvaluatorSupported(kind: StageAttentionRuleKind): boolean {
    const entry = catalogEntryForAttentionKind(kind);
    return entry?.evaluatorSupported !== false;
}

export function stageAttentionRuleUnsupportedReason(kind: StageAttentionRuleKind): string | null {
    const entry = catalogEntryForAttentionKind(kind);
    if (!entry || entry.evaluatorSupported !== false) return null;
    return entry.unsupportedReason ?? "Not evaluated at runtime for this stage context.";
}

export function newAttentionRuleDraft(index: number, kind: StageAttentionRuleKind = "work_overdue"): StageAttentionRuleV1 {
    const entry = catalogEntryForAttentionKind(kind)!;
    const draft: StageAttentionRuleV1 = {
        rule_key: `attention_${index + 1}`,
        kind,
        label: entry.label,
        severity: entry.defaultSeverity,
        targets: [],
    };
    if (entry.supportsDuration) {
        draft.threshold_duration = {
            offset_value: entry.defaultThreshold,
            offset_unit: "days",
        };
        draft.threshold = entry.defaultThreshold;
    } else if (entry.supportsThreshold) {
        draft.threshold = entry.defaultThreshold;
    }
    return draft;
}
