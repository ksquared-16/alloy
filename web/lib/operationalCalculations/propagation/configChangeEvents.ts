/**
 * Operational Calculation configuration-change events — the emit side (Stage 1).
 *
 * When calculation-related configuration is authored (ratio / capacity rules),
 * the authoring path emits a typed **authoring event** onto the existing platform
 * event envelope (`workflow_events` via `emitEvent`). This is a fact ABOUT
 * configuration — it says WHAT changed and carries no consequence (doc §6.4). It
 * is NOT an operational fact and does not enter any domain fact store (RFC D3).
 *
 * This reuses the canonical event layer; it introduces **no second event
 * mechanism**, no polling, no scheduler, and no persistence beyond the existing
 * `workflow_events` envelope.
 *
 * Emission is **best-effort**: a config write that already committed must never
 * be turned into a failure by an event-layer hiccup, and in V1 nothing is cached
 * (capacity is computed live), so a missed signal has no correctness impact. When
 * caching/consumers arrive, emission reliability can be hardened separately.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/04-realization-plan.md §Part 6
 */

import { emitEvent, type EmitEventInput } from "@/lib/emitEvent";
import type { ConfigRuleScopeContext } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT,
    OPERATIONAL_CALCULATION_CONFIG_EVENT_SCHEMA_VERSION,
    affectedCalculationKeysFor,
    type CalculationConfigChangeKind,
    type CalculationConfigRuleType,
} from "@/lib/operationalCalculations/propagation/types";

/** Everything the authoring path knows about one calculation-config change. */
export type CalculationConfigChangeInput = {
    orgId: string;
    ruleType: CalculationConfigRuleType;
    changeKind: CalculationConfigChangeKind;
    /** The authored rule row's id. */
    ruleId: string;
    /** The rule's scope (site / program / room / age group), as authored. */
    scope: ConfigRuleScopeContext;
    effectiveStart: string;
    effectiveEnd: string | null;
    actorUserId?: string | null;
};

/** The entity_type recorded on the event, per rule family. */
function entityTypeFor(ruleType: CalculationConfigRuleType): string {
    return ruleType === "ratio" ? "childcare_ratio_rules" : "childcare_capacity_rules";
}

/**
 * Build the `workflow_events` envelope for a calculation-config change. Pure:
 * deterministic given its input (the event layer stamps `occurred_at`).
 */
export function buildCalculationConfigChangedEvent(input: CalculationConfigChangeInput): EmitEventInput {
    return {
        org_id: input.orgId,
        event_type: OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT,
        entity_type: entityTypeFor(input.ruleType),
        entity_id: input.ruleId,
        action_type: `config_${input.changeKind}`,
        payload: {
            schema_version: OPERATIONAL_CALCULATION_CONFIG_EVENT_SCHEMA_VERSION,
            rule_type: input.ruleType,
            change_kind: input.changeKind,
            rule_id: input.ruleId,
            scope: {
                site_location_id: input.scope.siteLocationId ?? null,
                program_category_id: input.scope.programCategoryId ?? null,
                room_location_id: input.scope.roomLocationId ?? null,
                age_group_key: input.scope.ageGroupKey ?? null,
            },
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            affected_calculation_keys: affectedCalculationKeysFor(input.ruleType),
            actor_user_id: input.actorUserId ?? null,
        },
    };
}

/**
 * Emit a calculation-config change event. Best-effort: returns the event id, or
 * `null` if emission failed (logged, never thrown) so a committed config write is
 * never turned into a failure.
 */
export async function emitCalculationConfigChanged(
    input: CalculationConfigChangeInput,
): Promise<string | null> {
    try {
        return await emitEvent(buildCalculationConfigChangedEvent(input));
    } catch (e) {
        console.warn(
            `[operational-calculations] config-change event emission failed (non-fatal): ${(e as Error).message}`,
        );
        return null;
    }
}
