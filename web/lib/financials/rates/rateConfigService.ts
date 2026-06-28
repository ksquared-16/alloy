/**
 * Org-scoped fetchers for childcare rate configuration (P3.2).
 * Thin DB access; all resolution/precedence lives in the pure resolver
 * (resolveRate.ts). Read-only — never writes charges, ledger, GL, or AR.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import type {
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
} from "@/lib/financials/rates/rateTypes";
import {
    resolveRate,
    type RateResolution,
    type RateResolutionContext,
} from "@/lib/financials/rates/resolveRate";

function unwrap<T>(data: T[] | null, error: { message: string } | null): T[] {
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return data ?? [];
}

export async function listRatePlans(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareRatePlanRow[]> {
    const { data, error } = await supabase
        .from("childcare_rate_plans")
        .select("*")
        .eq("org_id", orgId);
    return unwrap(data as ChildcareRatePlanRow[] | null, error);
}

export async function listRateRules(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareRateRuleRow[]> {
    const { data, error } = await supabase
        .from("childcare_rate_rules")
        .select("*")
        .eq("org_id", orgId);
    return unwrap(data as ChildcareRateRuleRow[] | null, error);
}

export type RateConfigBundle = {
    ratePlans: ChildcareRatePlanRow[];
    rateRules: ChildcareRateRuleRow[];
};

/** Load the full rate-config bundle for an org (inputs to Rate Resolution). */
export async function loadRateConfigBundle(
    supabase: SupabaseClient,
    orgId: string
): Promise<RateConfigBundle> {
    const [ratePlans, rateRules] = await Promise.all([
        listRatePlans(supabase, orgId),
        listRateRules(supabase, orgId),
    ]);
    return { ratePlans, rateRules };
}

/**
 * Convenience DB wrapper: load org rate config and resolve the applicable rate
 * for a context/date. Pure resolution is delegated to resolveRate.
 */
export async function fetchResolvedRate(
    supabase: SupabaseClient,
    orgId: string,
    context: RateResolutionContext,
    dateYmd: string
): Promise<RateResolution> {
    const { ratePlans, rateRules } = await loadRateConfigBundle(supabase, orgId);
    return resolveRate({ plans: ratePlans, rules: rateRules, context, dateYmd });
}
