/**
 * Read-only catalog of Sprint B completion bootstrap rules for Settings visibility.
 * Source of truth for enforcement remains `web/lib/completion/*.ts` evaluators.
 */

export type CompletionBootstrapRuleGroup = "parent" | "child" | "opportunity" | "household";

export type CompletionBootstrapRuleCatalogEntry = {
    group: CompletionBootstrapRuleGroup;
    rule_key: string;
    label: string;
    requirement_type:
        | "always_required"
        | "required_on_save"
        | "required_before_status_transition"
        | "recommended_non_blocking";
    blocking_level: "hard_block" | "soft_warning" | "recommendation";
    /** Operator-facing phase / context when the rule applies. */
    phase_context: string;
    source: "bootstrap_code";
};

export const COMPLETION_BOOTSTRAP_RULES_CATALOG: CompletionBootstrapRuleCatalogEntry[] = [
    {
        group: "parent",
        rule_key: "first_name",
        label: "First name",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "save, preview, status_change",
        source: "bootstrap_code",
    },
    {
        group: "parent",
        rule_key: "last_name",
        label: "Last name",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "save, preview, status_change",
        source: "bootstrap_code",
    },
    {
        group: "parent",
        rule_key: "email_or_phone",
        label: "Email or phone",
        requirement_type: "required_on_save",
        blocking_level: "soft_warning",
        phase_context: "parent/guardian profile — blocks on save; preview shows recommendation",
        source: "bootstrap_code",
    },
    {
        group: "child",
        rule_key: "first_name",
        label: "First name",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "save, preview, status_change",
        source: "bootstrap_code",
    },
    {
        group: "child",
        rule_key: "last_name",
        label: "Last name",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "save, preview, status_change",
        source: "bootstrap_code",
    },
    {
        group: "child",
        rule_key: "date_of_birth",
        label: "Date of birth",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "child profile — hard block before active / future_start / enrolled status",
        source: "bootstrap_code",
    },
    {
        group: "child",
        rule_key: "start_date",
        label: "Start date",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "child profile — hard block before active / future_start / enrolled status",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "primary_person_id",
        label: "Primary contact",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "save — soft warning in preview",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "inquiry_children",
        label: "At least one child",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "save — soft warning in preview",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "tour_date",
        label: "Tour date",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "status → tour_scheduled",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "tour_time",
        label: "Tour time",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "status → tour_scheduled",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "location_id",
        label: "Location / site",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "status → tour_scheduled, tour_requested, waitlisted, ready_to_enroll, enrolled",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "desired_program_type",
        label: "Program / category",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "status → waitlisted, ready_to_enroll, enrolled",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "inquiry_child_name",
        label: "Child name (each inquiry child)",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "status → enrolled, ready_to_enroll",
        source: "bootstrap_code",
    },
    {
        group: "opportunity",
        rule_key: "desired_start_date",
        label: "Desired start date (each inquiry child)",
        requirement_type: "required_before_status_transition",
        blocking_level: "hard_block",
        phase_context: "status → enrolled, ready_to_enroll",
        source: "bootstrap_code",
    },
    {
        group: "household",
        rule_key: "primary_contact",
        label: "Primary contact",
        requirement_type: "always_required",
        blocking_level: "hard_block",
        phase_context: "household with guardians — blocks save; soft warning in preview",
        source: "bootstrap_code",
    },
];

export const COMPLETION_BOOTSTRAP_RULE_GROUPS: CompletionBootstrapRuleGroup[] = [
    "parent",
    "child",
    "opportunity",
    "household",
];

export function groupCompletionBootstrapRules(): Record<
    CompletionBootstrapRuleGroup,
    CompletionBootstrapRuleCatalogEntry[]
> {
    const out: Record<CompletionBootstrapRuleGroup, CompletionBootstrapRuleCatalogEntry[]> = {
        parent: [],
        child: [],
        opportunity: [],
        household: [],
    };
    for (const rule of COMPLETION_BOOTSTRAP_RULES_CATALOG) {
        out[rule.group].push(rule);
    }
    return out;
}

export function completionBootstrapGroupLabel(group: CompletionBootstrapRuleGroup): string {
    switch (group) {
        case "parent":
            return "Parent / guardian";
        case "child":
            return "Child";
        case "opportunity":
            return "Opportunity";
        case "household":
            return "Household";
    }
}
