/**
 * Rate configuration vocabularies + row shapes (P3.2).
 *
 * Code-owned mirror of
 * supabase/migrations/20260701120000_childcare_rate_plans_p3_2.sql. These define
 * pricing CONFIGURATION (L1) above the P3.1 posting substrate. Rate *Resolution*
 * is the pure read model over these shapes (resolveRate.ts).
 *
 * Boundaries: nothing here creates charges, posts, or touches AR/invoices/subsidy.
 * Currency lives on the plan only; rate rules inherit it (no per-rule currency).
 *
 * Doctrine: docs/platform/modules/billing-financials-platform.md (Rate Resolution).
 */

import type {
    ConfigRuleEffectiveColumns,
    ConfigRuleScopeColumns,
} from "@/lib/childcareOperational/config/configRuleTypes";

/** What the child attends (drives which rate line applies). */
export const SCHEDULE_BASES = [
    "full_day",
    "half_day",
    "three_day",
    "four_day",
    "five_day",
    "hourly",
    "drop_in",
] as const;
export type ScheduleBasis = (typeof SCHEDULE_BASES)[number];

export function isScheduleBasis(value: unknown): value is ScheduleBasis {
    return typeof value === "string" && (SCHEDULE_BASES as readonly string[]).includes(value);
}

/** How an amount is expressed / billed. */
export const RATE_BASES = ["annual", "monthly", "weekly", "daily", "session", "hourly"] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export function isRateBasis(value: unknown): value is RateBasis {
    return typeof value === "string" && (RATE_BASES as readonly string[]).includes(value);
}

/** Plan-level default billing basis (same vocabulary as rate basis). */
export const BILLING_BASES = RATE_BASES;
export type BillingBasis = RateBasis;

/** How a future Charge Resolution should compute amounts (declared, not executed in P3.2). */
export const CALCULATION_STRATEGIES = ["scheduled", "attendance_actual", "hybrid", "fixed"] as const;
export type CalculationStrategy = (typeof CALCULATION_STRATEGIES)[number];

export function isCalculationStrategy(value: unknown): value is CalculationStrategy {
    return typeof value === "string" && (CALCULATION_STRATEGIES as readonly string[]).includes(value);
}

/** HOOK ONLY (P3.2): reserved proration vocabulary; no proration implemented. */
export const PRORATION_METHODS = ["none", "daily", "calendar_day", "business_day"] as const;
export type ProrationMethod = (typeof PRORATION_METHODS)[number];

/** HOOK ONLY (P3.2): reserved cadence vocabulary; no cadence implemented. */
export const BILLING_CADENCES = ["monthly", "semi_monthly", "biweekly", "weekly", "term"] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

export const DEFAULT_RATE_CURRENCY_CODE = "USD";

/** childcare_rate_plans row. Reuses the shared scope + effective-dating columns. */
export type ChildcareRatePlanRow = ConfigRuleScopeColumns &
    ConfigRuleEffectiveColumns & {
        id: string;
        org_id: string;
        age_group_key: string | null;
        plan_key: string;
        label: string | null;
        currency_code: string;
        billing_basis: BillingBasis;
        calculation_strategy: CalculationStrategy;
        proration_method: ProrationMethod | null;
        billing_cadence: BillingCadence | null;
        is_active: boolean;
        source_key: string;
        metadata: Record<string, unknown>;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
    };

/** childcare_rate_rules row. Currency is inherited from the parent plan. */
export type ChildcareRateRuleRow = ConfigRuleEffectiveColumns & {
    id: string;
    org_id: string;
    rate_plan_id: string;
    schedule_basis: ScheduleBasis;
    rate_basis: RateBasis;
    age_group_key: string | null;
    amount_cents: number;
    source_key: string;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};
