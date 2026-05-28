/**
 * Waitlist demo scenario catalog — stable seed keys for cleanup/reseed.
 */

export type WaitlistDemoScenarioId =
    | "employee_parent"
    | "same_site_sibling"
    | "sister_site_sibling"
    | "multi_child_cohorts"
    | "manual_adjustment"
    | "forecast_hint"
    | "general_waitlist"
    | "missing_site_cohort";

export const WAITLIST_DEMO_SCENARIO_ORDER: WaitlistDemoScenarioId[] = [
    "employee_parent",
    "same_site_sibling",
    "sister_site_sibling",
    "multi_child_cohorts",
    "manual_adjustment",
    "forecast_hint",
    "general_waitlist",
    "missing_site_cohort",
];

export const WAITLIST_DEMO_SCENARIO_SEED_KEYS: Record<WaitlistDemoScenarioId, string> = {
    employee_parent: "waitlist_demo_employee_parent",
    same_site_sibling: "waitlist_demo_same_site_sibling",
    sister_site_sibling: "waitlist_demo_sister_site_sibling",
    multi_child_cohorts: "waitlist_demo_multi_child_cohorts",
    manual_adjustment: "waitlist_demo_manual_adjustment",
    forecast_hint: "waitlist_demo_forecast_hint",
    general_waitlist: "waitlist_demo_general_waitlist",
    missing_site_cohort: "waitlist_demo_missing_site_cohort",
};

export const WAITLIST_DEMO_SITE_SEED_KEYS = {
    north: "waitlist_demo_site_north",
    south: "waitlist_demo_site_south",
} as const;

export const WAITLIST_DEMO_COHORT_KEYS = {
    infant: "infant",
    toddler: "toddler",
    preschool: "preschool",
} as const;

export function waitlistDemoFamilyLast(scenario: WaitlistDemoScenarioId): string {
    const map: Record<WaitlistDemoScenarioId, string> = {
        employee_parent: "Chen",
        same_site_sibling: "Patel",
        sister_site_sibling: "Nguyen",
        multi_child_cohorts: "Williams",
        manual_adjustment: "Foster",
        forecast_hint: "Santos",
        general_waitlist: "Murphy",
        missing_site_cohort: "Reed",
    };
    return map[scenario];
}
