/**
 * Work View Conditions V2 — canonical registry of typed operational condition fields.
 *
 * Single source of truth for the Work View "Show work when…" condition builder. Consumed by:
 *  - the editor field list + grouped dropdown (`WorkViewConditionEditor`)
 *  - the value-control resolver (`workViewFilterValueControls`)
 *  - the runtime evaluator (`evaluateWorkViewFiltersV1`)
 *  - the legacy normalizer (`workViewsConfigV1.parseWorkViewsV1`)
 *
 * Doctrine: Stages remain process configuration. Work View conditions expose typed predicates
 * ("Opportunity Stage", "Opportunity Status", "Child Enrollment Status", …) — never a generic
 * "Stage" / "Status" that shares one status set across unrelated subjects.
 */

import type { WorkViewFilterOperatorV1 } from "@/lib/lifecycle/workViewsConfigV1";

export type WorkViewConditionFieldGroup = "lead" | "child" | "household" | "operational";

export type WorkViewConditionSubject = "opportunity" | "child" | "person" | "record";

export type WorkViewConditionValueKind =
    | "stage_select"
    | "status_select"
    | "location_select"
    | "program_select"
    | "boolean"
    | "date_preset"
    | "text"
    | "none";

/** Where the value dropdown sources its options. */
export type WorkViewConditionOptionSource =
    | { kind: "process_stages" }
    | { kind: "status_definitions"; entityType: string; statusProfile?: "generic" | "child" }
    | { kind: "locations" }
    | { kind: "programs" }
    | { kind: "boolean" }
    | { kind: "date" }
    | { kind: "none" };

export type WorkViewConditionFieldDef = {
    key: string;
    label: string;
    group: WorkViewConditionFieldGroup;
    subject: WorkViewConditionSubject;
    valueKind: WorkViewConditionValueKind;
    optionSource: WorkViewConditionOptionSource;
    operators: readonly WorkViewFilterOperatorV1[];
    /** Canonical key the runtime evaluator resolves a row value for. */
    runtimeField: string;
    /** Whether the runtime evaluator can apply this field. UI hides runtime-unsupported fields. */
    runtimeSupported: boolean;
};

const SELECT_OPERATORS: readonly WorkViewFilterOperatorV1[] = [
    "equals",
    "not_equals",
    "is_any_of",
    "is_empty",
    "is_not_empty",
];
const BOOLEAN_OPERATORS: readonly WorkViewFilterOperatorV1[] = ["equals", "not_equals"];
const DATE_OPERATORS: readonly WorkViewFilterOperatorV1[] = ["equals", "date_is", "is_empty", "is_not_empty"];

/**
 * Selectable typed fields, in display order. Generic `status` / `stage` / `location` are intentionally
 * absent — they survive only as legacy aliases (see {@link LEGACY_FIELD_KEY_ALIASES}).
 */
export const WORK_VIEW_CONDITION_FIELD_DEFS: readonly WorkViewConditionFieldDef[] = [
    {
        key: "opportunity_stage",
        label: "Lead Stage",
        group: "lead",
        subject: "opportunity",
        valueKind: "stage_select",
        optionSource: { kind: "process_stages" },
        operators: SELECT_OPERATORS,
        runtimeField: "opportunity_stage",
        runtimeSupported: true,
    },
    {
        key: "opportunity_status",
        label: "Lead Status",
        group: "lead",
        subject: "opportunity",
        valueKind: "status_select",
        optionSource: { kind: "status_definitions", entityType: "opportunities" },
        operators: SELECT_OPERATORS,
        runtimeField: "opportunity_status",
        runtimeSupported: true,
    },
    {
        key: "tour_date",
        label: "Tour date",
        group: "lead",
        subject: "opportunity",
        valueKind: "date_preset",
        optionSource: { kind: "date" },
        operators: DATE_OPERATORS,
        runtimeField: "tour_date",
        runtimeSupported: true,
    },
    {
        key: "child_enrollment_status",
        label: "Child Enrollment Status",
        group: "child",
        subject: "child",
        valueKind: "status_select",
        optionSource: { kind: "status_definitions", entityType: "opportunity_customer_members" },
        operators: SELECT_OPERATORS,
        runtimeField: "child_enrollment_status",
        runtimeSupported: true,
    },
    {
        key: "program",
        label: "Program",
        group: "child",
        subject: "child",
        valueKind: "program_select",
        optionSource: { kind: "programs" },
        operators: SELECT_OPERATORS,
        runtimeField: "program",
        runtimeSupported: true,
    },
    {
        key: "site",
        label: "Campus",
        group: "household",
        subject: "record",
        valueKind: "location_select",
        optionSource: { kind: "locations" },
        operators: SELECT_OPERATORS,
        runtimeField: "site",
        runtimeSupported: true,
    },
    {
        key: "needs_attention",
        label: "Needs Attention",
        group: "operational",
        subject: "record",
        valueKind: "boolean",
        optionSource: { kind: "boolean" },
        operators: BOOLEAN_OPERATORS,
        runtimeField: "needs_attention",
        runtimeSupported: true,
    },
    {
        key: "needs_follow_up",
        label: "Needs follow-up",
        group: "operational",
        subject: "record",
        valueKind: "boolean",
        optionSource: { kind: "boolean" },
        operators: BOOLEAN_OPERATORS,
        runtimeField: "needs_follow_up",
        runtimeSupported: true,
    },
    {
        key: "updated_at",
        label: "Updated",
        group: "operational",
        subject: "record",
        valueKind: "date_preset",
        optionSource: { kind: "date" },
        operators: DATE_OPERATORS,
        runtimeField: "updated_at",
        runtimeSupported: true,
    },
];

/**
 * Legacy `field_key` → canonical key. Generic `stage`/`status`/`location` predate the typed registry.
 * Unambiguous in this codebase: `status` always meant the opportunity case status, `stage` the process
 * lifecycle stage, `location` the site. Used for both load-time normalization and runtime resolution.
 */
export const LEGACY_FIELD_KEY_ALIASES: Readonly<Record<string, string>> = {
    stage: "opportunity_stage",
    status: "opportunity_status",
    location: "site",
};

const FIELD_DEF_BY_KEY = new Map<string, WorkViewConditionFieldDef>(
    WORK_VIEW_CONDITION_FIELD_DEFS.map((def) => [def.key, def]),
);

/** Resolve a possibly-legacy field key to its canonical registry key. */
export function canonicalWorkViewConditionFieldKey(fieldKey: string): string {
    const key = String(fieldKey ?? "").trim();
    return LEGACY_FIELD_KEY_ALIASES[key] ?? key;
}

/** Field definition for a canonical or legacy key (null for genuinely unknown keys). */
export function getWorkViewConditionField(fieldKey: string): WorkViewConditionFieldDef | null {
    return FIELD_DEF_BY_KEY.get(canonicalWorkViewConditionFieldKey(fieldKey)) ?? null;
}

export function isLegacyWorkViewConditionFieldKey(fieldKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(LEGACY_FIELD_KEY_ALIASES, String(fieldKey ?? "").trim());
}

export type WorkViewConditionFieldGroupSpec = {
    key: WorkViewConditionFieldGroup;
    label: string;
    fields: readonly WorkViewConditionFieldDef[];
};

const GROUP_LABELS: Record<WorkViewConditionFieldGroup, string> = {
    lead: "Lead",
    child: "Child",
    household: "Household",
    operational: "Operational",
};

const GROUP_ORDER: readonly WorkViewConditionFieldGroup[] = ["lead", "child", "household", "operational"];

/** Selectable fields grouped for the editor's `<optgroup>` field dropdown, in canonical order. */
export function workViewConditionFieldGroups(): WorkViewConditionFieldGroupSpec[] {
    return GROUP_ORDER.map((groupKey) => ({
        key: groupKey,
        label: GROUP_LABELS[groupKey],
        fields: WORK_VIEW_CONDITION_FIELD_DEFS.filter(
            (def) => def.group === groupKey && def.runtimeSupported,
        ),
    })).filter((group) => group.fields.length > 0);
}

/** Default selectable field key for a new condition row. */
export const DEFAULT_WORK_VIEW_CONDITION_FIELD_KEY = "opportunity_stage";
