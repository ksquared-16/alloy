/**
 * Idempotent dev/demo seed for childcare first-class config rules (P1 tables).
 * Makes Schedule-derived Expectations visible by giving a site ratio/capacity/
 * operating-window/schedule config. Re-run safe via a metadata seed marker.
 *
 * Internal/dev only. Operational agreements/placements/assignments come from the
 * enrollment foundation seed; this only adds L1 config truth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const CHILDCARE_CONFIG_RULES_DEMO_SEED_KEY = "childcare_config_rules_demo_v1";

export type SeedChildcareConfigRulesResult =
    | { ok: true; skipped: true }
    | {
          ok: true;
          skipped: false;
          summary: {
              ratioRules: number;
              ratioTiers: number;
              capacityRules: number;
              operatingWindows: number;
              scheduleRules: number;
          };
      }
    | { ok: false; error: string };

const SEED_MARKER = { seed_key: CHILDCARE_CONFIG_RULES_DEMO_SEED_KEY };
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];
const EFFECTIVE_START = "2026-01-01";

export async function seedChildcareConfigRulesDemo(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<SeedChildcareConfigRulesResult> {
    if (!orgId || !siteLocationId) {
        return { ok: false, error: "orgId and siteLocationId are required" };
    }

    // Idempotency: skip if a demo ratio rule already exists for this site.
    const { data: existing, error: existingError } = await supabase
        .from("childcare_ratio_rules")
        .select("id")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .contains("metadata", SEED_MARKER)
        .maybeSingle();
    if (existingError) return { ok: false, error: existingError.message };
    if (existing) return { ok: true, skipped: true };

    // 1) Site ratio rule + tiers (1↑5, 2↑11, 3↑16).
    const { data: ratioRule, error: ratioError } = await supabase
        .from("childcare_ratio_rules")
        .insert({
            org_id: orgId,
            scope_type: "site",
            site_location_id: siteLocationId,
            effective_start: EFFECTIVE_START,
            source_key: "demo",
            metadata: SEED_MARKER,
        })
        .select("id")
        .single();
    if (ratioError || !ratioRule) {
        return { ok: false, error: ratioError?.message ?? "failed to insert ratio rule" };
    }

    const ratioRuleId = (ratioRule as { id: string }).id;
    const { error: tiersError } = await supabase.from("childcare_ratio_rule_tiers").insert([
        { org_id: orgId, ratio_rule_id: ratioRuleId, max_children: 5, required_staff: 1, sort_order: 10 },
        { org_id: orgId, ratio_rule_id: ratioRuleId, max_children: 11, required_staff: 2, sort_order: 20 },
        { org_id: orgId, ratio_rule_id: ratioRuleId, max_children: 16, required_staff: 3, sort_order: 30 },
    ]);
    if (tiersError) return { ok: false, error: tiersError.message };

    // 2) Site operating window per weekday (Mon–Fri 7:00–18:00).
    const { error: windowsError } = await supabase.from("childcare_operating_windows").insert(
        WEEKDAYS_MON_FRI.map((weekday) => ({
            org_id: orgId,
            scope_type: "site",
            site_location_id: siteLocationId,
            weekday,
            open_time: "07:00",
            close_time: "18:00",
            effective_start: EFFECTIVE_START,
            source_key: "demo",
            metadata: SEED_MARKER,
        }))
    );
    if (windowsError) return { ok: false, error: windowsError.message };

    // 3) Site operational capacity rule.
    const { error: capacityError } = await supabase.from("childcare_capacity_rules").insert({
        org_id: orgId,
        scope_type: "site",
        site_location_id: siteLocationId,
        capacity_kind: "operational",
        capacity: 60,
        effective_start: EFFECTIVE_START,
        source_key: "demo",
        metadata: SEED_MARKER,
    });
    if (capacityError) return { ok: false, error: capacityError.message };

    // 4) Site schedule policy (1–5 days/week).
    const { error: scheduleError } = await supabase.from("childcare_schedule_rules").insert({
        org_id: orgId,
        scope_type: "site",
        site_location_id: siteLocationId,
        min_days_per_week: 1,
        max_days_per_week: 5,
        effective_start: EFFECTIVE_START,
        source_key: "demo",
        metadata: SEED_MARKER,
    });
    if (scheduleError) return { ok: false, error: scheduleError.message };

    return {
        ok: true,
        skipped: false,
        summary: {
            ratioRules: 1,
            ratioTiers: 3,
            capacityRules: 1,
            operatingWindows: WEEKDAYS_MON_FRI.length,
            scheduleRules: 1,
        },
    };
}
