/**
 * Org-scoped fetchers for childcare first-class config rules (Phase 1).
 * Thin DB access; resolution/precedence lives in the pure resolver modules.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import type {
    ChildcareCapacityRuleRow,
    ChildcareOperatingWindowRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
    ChildcareScheduleRuleRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

function unwrap<T>(data: T[] | null, error: { message: string } | null): T[] {
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return data ?? [];
}

export async function listCapacityRules(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareCapacityRuleRow[]> {
    const { data, error } = await supabase
        .from("childcare_capacity_rules")
        .select("*")
        .eq("org_id", orgId);
    return unwrap(data as ChildcareCapacityRuleRow[] | null, error);
}

export async function listRatioRules(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareRatioRuleRow[]> {
    const { data, error } = await supabase
        .from("childcare_ratio_rules")
        .select("*")
        .eq("org_id", orgId);
    return unwrap(data as ChildcareRatioRuleRow[] | null, error);
}

export async function listRatioRuleTiers(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareRatioRuleTierRow[]> {
    const { data, error } = await supabase
        .from("childcare_ratio_rule_tiers")
        .select("*")
        .eq("org_id", orgId)
        .order("max_children", { ascending: true });
    return unwrap(data as ChildcareRatioRuleTierRow[] | null, error);
}

export async function listOperatingWindows(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareOperatingWindowRow[]> {
    const { data, error } = await supabase
        .from("childcare_operating_windows")
        .select("*")
        .eq("org_id", orgId);
    return unwrap(data as ChildcareOperatingWindowRow[] | null, error);
}

export async function listScheduleRules(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareScheduleRuleRow[]> {
    const { data, error } = await supabase
        .from("childcare_schedule_rules")
        .select("*")
        .eq("org_id", orgId);
    return unwrap(data as ChildcareScheduleRuleRow[] | null, error);
}

export type ChildcareConfigRuleBundle = {
    capacityRules: ChildcareCapacityRuleRow[];
    ratioRules: ChildcareRatioRuleRow[];
    ratioRuleTiers: ChildcareRatioRuleTierRow[];
    operatingWindows: ChildcareOperatingWindowRow[];
    scheduleRules: ChildcareScheduleRuleRow[];
};

/** Load the full config-rule bundle for an org (inputs to derived expectations). */
export async function loadChildcareConfigRuleBundle(
    supabase: SupabaseClient,
    orgId: string
): Promise<ChildcareConfigRuleBundle> {
    const [capacityRules, ratioRules, ratioRuleTiers, operatingWindows, scheduleRules] =
        await Promise.all([
            listCapacityRules(supabase, orgId),
            listRatioRules(supabase, orgId),
            listRatioRuleTiers(supabase, orgId),
            listOperatingWindows(supabase, orgId),
            listScheduleRules(supabase, orgId),
        ]);
    return { capacityRules, ratioRules, ratioRuleTiers, operatingWindows, scheduleRules };
}
