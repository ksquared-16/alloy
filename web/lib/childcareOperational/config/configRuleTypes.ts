/**
 * Row shapes + scope vocabulary for childcare first-class config rules
 * (Phase 1). Keep aligned with
 * supabase/migrations/20260628120000_childcare_config_rules_phase1.sql
 *
 * Doctrine: L1 Configuration in docs/platform/operational-truth-flow-doctrine.md.
 * These tables are config truth; expectations derive from them and are never
 * persisted as system-of-record.
 */

export const CONFIG_RULE_SCOPE_TYPES = ["org", "site", "program", "room"] as const;
export type ConfigRuleScopeType = (typeof CONFIG_RULE_SCOPE_TYPES)[number];

export const CAPACITY_KINDS = ["physical", "licensed", "operational"] as const;
export type CapacityKind = (typeof CAPACITY_KINDS)[number];

/** Shared scope columns present on every scoped config rule table. */
export type ConfigRuleScopeColumns = {
    scope_type: ConfigRuleScopeType;
    site_location_id: string | null;
    program_category_id: string | null;
    room_location_id: string | null;
};

/** Shared effective-dating columns (calendar dates, YYYY-MM-DD). */
export type ConfigRuleEffectiveColumns = {
    effective_start: string;
    effective_end: string | null;
};

export type ChildcareCapacityRuleRow = ConfigRuleScopeColumns &
    ConfigRuleEffectiveColumns & {
        id: string;
        org_id: string;
        age_group_key: string | null;
        capacity_kind: CapacityKind;
        capacity: number;
        source_key: string;
        metadata: Record<string, unknown>;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
    };

export type ChildcareRatioRuleRow = ConfigRuleScopeColumns &
    ConfigRuleEffectiveColumns & {
        id: string;
        org_id: string;
        age_group_key: string | null;
        jurisdiction_key: string | null;
        source_key: string;
        metadata: Record<string, unknown>;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
    };

export type ChildcareRatioRuleTierRow = {
    id: string;
    org_id: string;
    ratio_rule_id: string;
    max_children: number;
    required_staff: number;
    sort_order: number;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

export type ChildcareOperatingWindowRow = ConfigRuleScopeColumns &
    ConfigRuleEffectiveColumns & {
        id: string;
        org_id: string;
        weekday: number;
        open_time: string;
        close_time: string;
        source_key: string;
        metadata: Record<string, unknown>;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
    };

export type ChildcareScheduleRuleRow = ConfigRuleScopeColumns &
    ConfigRuleEffectiveColumns & {
        id: string;
        org_id: string;
        age_group_key: string | null;
        eligible_schedule_type_keys: string[] | null;
        eligible_age_group_keys: string[] | null;
        min_days_per_week: number | null;
        max_days_per_week: number | null;
        source_key: string;
        metadata: Record<string, unknown>;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
    };

/**
 * Context an operational object presents to the resolver. Most-specific-wins
 * resolution selects the applicable rule for this context on a given date.
 */
export type ConfigRuleScopeContext = {
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    ageGroupKey?: string | null;
};
