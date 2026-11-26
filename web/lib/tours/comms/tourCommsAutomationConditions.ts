/**
 * Tour automation Rule conditions — reuse Work View filters_v1 + evaluator.
 *
 * Persistence lives on TourCommsConfig (org policy). Evaluation uses
 * evaluateWorkViewFiltersForRow with match=all (AND). No nested boolean editor.
 *
 * Only expose fields the Tour reminder scheduler can supply as facts.
 */

import { evaluateWorkViewFiltersForRow } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import {
    canonicalWorkViewConditionFieldKey,
    getWorkViewConditionField,
    WORK_VIEW_CONDITION_FIELD_DEFS,
    type WorkViewConditionFieldDef,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import type { WorkViewFilterOperatorV1, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";

/** Fields Tour reminder scheduling can evaluate against booking/opportunity facts. */
export const TOUR_AUTOMATION_CONDITION_FIELD_KEYS = [
    "opportunity_stage",
    "site",
    "has_active_tour",
    "opportunity_status",
] as const;

export type TourAutomationConditionFieldKey = (typeof TOUR_AUTOMATION_CONDITION_FIELD_KEYS)[number];

const ALLOWED = new Set<string>(TOUR_AUTOMATION_CONDITION_FIELD_KEYS);

const FILTER_OPERATORS = new Set<WorkViewFilterOperatorV1>([
    "equals",
    "not_equals",
    "is_any_of",
    "is_empty",
    "is_not_empty",
    "date_is",
    "date_between",
]);

export type TourAutomationConditionFacts = {
    lifecycle_stage_key?: string | null;
    stage_key?: string | null;
    site_id?: string | null;
    location_id?: string | null;
    status_key?: string | null;
    has_active_tour?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function tourAutomationConditionFieldDefs(): WorkViewConditionFieldDef[] {
    return WORK_VIEW_CONDITION_FIELD_DEFS.filter(
        (def) => ALLOWED.has(def.key) && def.runtimeSupported,
    );
}

export function isTourAutomationConditionFieldKey(key: string): key is TourAutomationConditionFieldKey {
    return ALLOWED.has(canonicalWorkViewConditionFieldKey(key.trim()));
}

export function parseTourAutomationCondition(raw: unknown): WorkViewFilterV1 | null {
    if (!isRecord(raw)) return null;
    const rawFieldKey = typeof raw.field_key === "string" ? raw.field_key.trim() : "";
    const operator = typeof raw.operator === "string" ? raw.operator.trim() : "";
    if (!rawFieldKey || !FILTER_OPERATORS.has(operator as WorkViewFilterOperatorV1)) return null;
    const field_key = canonicalWorkViewConditionFieldKey(rawFieldKey);
    if (!ALLOWED.has(field_key)) return null;
    const def = getWorkViewConditionField(field_key);
    if (!def?.runtimeSupported) return null;
    return {
        field_key,
        operator: operator as WorkViewFilterOperatorV1,
        value: raw.value ?? null,
    };
}

export function parseTourAutomationConditions(raw: unknown): WorkViewFilterV1[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(parseTourAutomationCondition).filter((row): row is WorkViewFilterV1 => row != null);
}

/** Build the synthetic row shape evaluateWorkViewFiltersForRow already understands. */
export function tourAutomationConditionRowFromFacts(
    facts: TourAutomationConditionFacts,
): Record<string, unknown> {
    const stage =
        String(facts.lifecycle_stage_key ?? "").trim()
        || String(facts.stage_key ?? "").trim()
        || null;
    const site =
        String(facts.site_id ?? "").trim()
        || String(facts.location_id ?? "").trim()
        || null;
    return {
        id: "tour_automation_subject",
        lifecycle_stage_key: stage,
        stage_key: stage,
        site_id: site,
        location_id: site,
        status_key: String(facts.status_key ?? "").trim() || null,
        has_active_tour: facts.has_active_tour === true,
    };
}

/**
 * AND-evaluate automation conditions. Empty list = always pass (no gate).
 */
export function evaluateTourAutomationConditions(
    conditions: readonly WorkViewFilterV1[],
    facts: TourAutomationConditionFacts,
): { pass: boolean } {
    if (!conditions.length) return { pass: true };
    const row = tourAutomationConditionRowFromFacts(facts);
    return { pass: evaluateWorkViewFiltersForRow(row, conditions, "all").pass };
}
