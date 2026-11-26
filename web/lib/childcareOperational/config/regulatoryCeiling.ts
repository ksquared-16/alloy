/**
 * Regulatory (licensing) capacity ceiling — resolution-time clamp + author-time
 * guard (Phase A, A7).
 *
 * Ratified rule (RFC §9 item 9 / §12): licensed capacity is a BINDING CEILING.
 * Organization/Location/Program/Room overrides may only TIGHTEN it (lower it),
 * never weaken it (raise it). The previously-verified gap was that plain
 * most-specific-wins over the `licensed` capacity kind let a narrower rule with a
 * HIGHER value silently raise the effective licensed ceiling.
 *
 * Fix, two layers:
 *   1. Resolution-time: the effective licensed ceiling is the MINIMUM capacity
 *      across ALL applicable, effective `licensed`-kind rules — regardless of
 *      scope specificity — so a weaker override cannot raise it.
 *   2. Author-time: a pure validator rejects creating/versioning a `licensed`
 *      rule whose value would exceed the current effective ceiling of the
 *      already-applicable licensing rules.
 *
 * Capacity ceilings: LOWER is stricter (min). (Required-staff, where HIGHER is
 * stricter, is the ratio engine's concern — not applied here.)
 *
 * Pure functions only — no DB, no IO.
 */

import { resolveMatchingConfigRules } from "@/lib/childcareOperational/config/resolveConfigRule";
import type {
    ChildcareCapacityRuleRow,
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";

/** Provenance marker for regulatory rules (`childcare_*_rules.source_key`). */
export const LICENSING_SOURCE_KEY = "licensing";

export type LicensedCeilingResult = {
    /** Effective licensed ceiling = min over applicable licensed rules; null if none. */
    ceiling: number | null;
    /** Id of the rule whose value set the ceiling (most specific among ties). */
    boundByRuleId: string | null;
    /** Ids of every licensed rule that applied (for explainability). */
    consideredRuleIds: string[];
};

/**
 * Resolve the binding licensed capacity ceiling for a context on a date: the
 * minimum capacity across all applicable, effective `licensed`-kind rules.
 * A more-specific rule with a higher value cannot raise the ceiling.
 */
export function resolveLicensedCeiling(
    rules: readonly ChildcareCapacityRuleRow[],
    context: ConfigRuleScopeContext,
    dateYmd: string
): LicensedCeilingResult {
    const licensed = rules.filter((r) => r.capacity_kind === "licensed");
    // resolveMatchingConfigRules returns applicable+effective rules, most-specific first.
    const applicable = resolveMatchingConfigRules(licensed, context, dateYmd);
    if (applicable.length === 0) {
        return { ceiling: null, boundByRuleId: null, consideredRuleIds: [] };
    }

    let ceiling = Number.POSITIVE_INFINITY;
    let boundByRuleId: string | null = null;
    for (const rule of applicable) {
        // strict `<` so that, among equal minima, the most-specific (earliest in
        // the precedence-sorted list) rule is retained as the binding one.
        if (rule.capacity < ceiling) {
            ceiling = rule.capacity;
            boundByRuleId = rule.id;
        }
    }

    return {
        ceiling: Number.isFinite(ceiling) ? ceiling : null,
        boundByRuleId,
        consideredRuleIds: applicable.map((r) => r.id),
    };
}

export type LicensedOverrideValidation =
    | { ok: true }
    | {
          ok: false;
          code: "licensing_override_weakens_ceiling";
          message: string;
          boundByRuleId: string | null;
          boundCeiling: number;
      };

/**
 * Author-time guard: reject a candidate `licensed` capacity value that would
 * exceed (weaken) the effective ceiling already imposed by the applicable
 * licensing rules at the candidate's context + date. Tightening (a lower or
 * equal value) is always allowed; the first licensing rule (no existing
 * ceiling) is always allowed.
 *
 * `existingRules` should exclude the candidate itself (this is a pre-insert
 * check). Non-`licensed` candidates are out of scope and return ok.
 */
export function validateLicensedOverrideNotWeaker(
    candidate: {
        capacityKind: string;
        capacity: number;
        context: ConfigRuleScopeContext;
        effectiveStart: string;
    },
    existingRules: readonly ChildcareCapacityRuleRow[]
): LicensedOverrideValidation {
    if (candidate.capacityKind !== "licensed") return { ok: true };

    const { ceiling, boundByRuleId } = resolveLicensedCeiling(
        existingRules,
        candidate.context,
        candidate.effectiveStart
    );
    if (ceiling == null) return { ok: true };
    if (candidate.capacity <= ceiling) return { ok: true };

    return {
        ok: false,
        code: "licensing_override_weakens_ceiling",
        message:
            `A licensed capacity of ${candidate.capacity} would exceed the binding ` +
            `licensing ceiling of ${ceiling}. Local overrides may only tighten licensing limits.`,
        boundByRuleId,
        boundCeiling: ceiling,
    };
}
