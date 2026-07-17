/**
 * Operational Calculation invalidation predicate (Stage 2).
 *
 * Given a configuration-change event, decide which calculation resolutions are
 * stale. This is a **pure predicate** — it computes nothing, mutates nothing, and
 * performs no IO (doc §6.4 Stage 2: *"A PREDICATE. Computes nothing."*). It is the
 * mechanism a cache/consumer layer would consult; in V1 the runtime computes
 * capacity live and caches nothing, so the predicate is exercised by tests rather
 * than by a live cache — which is exactly why capacity is the safe reference
 * family (it exercises propagation without needing recalculation machinery, §6.5).
 *
 * Determinism: the predicate never invokes a handler, the runtime, or a clock.
 * The Operational Calculation Runtime never observes configuration mutations —
 * only this predicate reasons over the emitted event, keeping the runtime
 * deterministic and free of the propagation concern.
 *
 * Separation of stages (mandatory, §6.4): this stage NEVER recalculates and NEVER
 * triggers a judgment. It answers one question — "is this result stale?" — and
 * stops.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/04-realization-plan.md §Part 6
 *
 * Pure functions only. No IO.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import type { ConfigRuleScopeContext } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    affectedCalculationKeysFor,
    type CalculationConfigChangeKind,
    type CalculationConfigRuleType,
} from "@/lib/operationalCalculations/propagation/types";

/** The invalidation-relevant projection of a config-change event. */
export type CalculationConfigChange = {
    ruleType: CalculationConfigRuleType;
    changeKind: CalculationConfigChangeKind;
    /** Scope as authored on the rule (a level is `null` when the rule is broader). */
    scope: ConfigRuleScopeContext;
    effectiveStart: string;
    effectiveEnd: string | null;
};

/**
 * The identity of a (possibly cached) calculation result, for staleness testing.
 * `scope` carries every level the result was resolved at (site + program + room),
 * and `asOf` is the resolution date.
 */
export type CalculationResultCoordinate = {
    calculationKey: string;
    scope: ConfigRuleScopeContext;
    asOf: string;
};

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
    return (a ?? null) === (b ?? null);
}

/**
 * True when the change's scope is an ancestor-or-equal of the coordinate's scope.
 * A `null` level on the change is a wildcard (the change is broader at that
 * level); a non-null level must match the coordinate exactly. Because a result
 * coordinate carries every level it resolved at, a site-level change correctly
 * matches a room-level result under that site, while a room-level change does not
 * match a different room. No org tree is consulted — the decision is structural.
 */
export function changeScopeContains(change: ConfigRuleScopeContext, coord: ConfigRuleScopeContext): boolean {
    const covers = (c: string | null | undefined, r: string | null | undefined) => c == null || eq(c, r);
    return (
        covers(change.siteLocationId, coord.siteLocationId) &&
        covers(change.programCategoryId, coord.programCategoryId) &&
        covers(change.roomLocationId, coord.roomLocationId) &&
        covers(change.ageGroupKey, coord.ageGroupKey)
    );
}

/**
 * True when a resolution date falls within the change's effective window
 * `[effectiveStart, effectiveEnd]` (open-ended when `effectiveEnd` is null). A
 * resolution dated before the change takes effect, or after its window closes, is
 * unaffected.
 */
export function effectiveWindowCoversAsOf(
    effectiveStart: string,
    effectiveEnd: string | null,
    asOf: string,
): boolean {
    if (compareIsoDates(asOf, effectiveStart) < 0) return false;
    if (effectiveEnd != null && compareIsoDates(asOf, effectiveEnd) > 0) return false;
    return true;
}

/**
 * The invalidation predicate: does this configuration change invalidate this
 * calculation result? True iff (1) the change's rule type feeds the result's
 * calculation key, (2) the change's scope contains the result's scope, and (3)
 * the change's effective window covers the result's resolution date.
 */
export function calculationResultInvalidatedBy(
    change: CalculationConfigChange,
    coordinate: CalculationResultCoordinate,
): boolean {
    if (!affectedCalculationKeysFor(change.ruleType).includes(coordinate.calculationKey)) return false;
    if (!changeScopeContains(change.scope, coordinate.scope)) return false;
    return effectiveWindowCoversAsOf(change.effectiveStart, change.effectiveEnd, coordinate.asOf);
}

/** Filter a set of result coordinates to exactly those invalidated by the change. */
export function selectInvalidated(
    change: CalculationConfigChange,
    coordinates: readonly CalculationResultCoordinate[],
): readonly CalculationResultCoordinate[] {
    return coordinates.filter((c) => calculationResultInvalidatedBy(change, c));
}
