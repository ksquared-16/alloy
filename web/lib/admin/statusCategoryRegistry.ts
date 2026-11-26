/**
 * Registry-driven status category doctrine.
 *
 * Every operator-facing status category must declare a clear authoritative owner.
 * New categories are allowed only when they own a real platform concept.
 */

export type StatusCategoryDomain =
    | "enrollment"
    | "people"
    | "operations"
    | "platform"
    | "billing";

export type StatusCategorySettingsTier = "primary" | "standard" | "advanced";

export type StatusCategoryRegistryEntry = {
    /** status_definitions.entity_type */
    entity_type: string;
    /** Operator-facing Settings section title */
    operatorLabel: string;
    /** Authoritative persisted field */
    authoritative: { table: string; column: string };
    domain: StatusCategoryDomain;
    /** Primary enrollment owners surface first in Settings */
    settingsTier: StatusCategorySettingsTier;
    /** Listed on Settings → Status Management and unscoped status-definitions aggregate */
    settingsVisible: boolean;
    /** Stage/status assignment lives in Business Processes when true */
    processLinked?: boolean;
    /** Short operator description of what this status powers */
    usageSummary: string;
};

/** Today's primary status owners — not an exhaustive platform list. */
export const PRIMARY_STATUS_CATEGORY_ENTITY_TYPES = [
    "opportunities",
    "opportunity_customer_members",
    "persons",
] as const;

/**
 * Operator-visible status categories for Settings → Status Management.
 * Excludes deprecated `customer_members` roster status (no authoritative process owner).
 */
export const OPERATOR_STATUS_CATEGORY_REGISTRY: readonly StatusCategoryRegistryEntry[] = [
    {
        entity_type: "opportunities",
        operatorLabel: "Lead Statuses",
        authoritative: { table: "opportunities", column: "status_key" },
        domain: "enrollment",
        settingsTier: "primary",
        settingsVisible: true,
        processLinked: true,
        usageSummary: "Lead drawer status dropdown and family-track enrollment stages.",
    },
    {
        entity_type: "opportunity_customer_members",
        operatorLabel: "Enrollment Participation",
        authoritative: {
            table: "opportunity_customer_members",
            column: "outcome_status_key",
        },
        domain: "enrollment",
        settingsTier: "primary",
        settingsVisible: true,
        processLinked: true,
        usageSummary:
            "Per-child enrollment status on a Lead. Drives Waitlist, Enrolling, and Enrolled queues.",
    },
    {
        entity_type: "persons",
        operatorLabel: "People Statuses",
        authoritative: { table: "persons", column: "status_key" },
        domain: "people",
        settingsTier: "primary",
        settingsVisible: true,
        usageSummary: "People and Child drawer status dropdowns (filtered by applicability profile).",
    },
    {
        entity_type: "schedules",
        operatorLabel: "Schedules",
        authoritative: { table: "schedules", column: "status_key" },
        domain: "operations",
        settingsTier: "standard",
        settingsVisible: true,
        usageSummary: "Schedule record status labels.",
    },
    {
        entity_type: "jobs",
        operatorLabel: "Jobs",
        authoritative: { table: "jobs", column: "status_key" },
        domain: "operations",
        settingsTier: "standard",
        settingsVisible: true,
        usageSummary: "Job record status labels.",
    },
    {
        entity_type: "customers",
        operatorLabel: "Customers",
        authoritative: { table: "customers", column: "status_key" },
        domain: "operations",
        settingsTier: "standard",
        settingsVisible: true,
        usageSummary: "Customer / household record status labels.",
    },
    {
        entity_type: "vendors",
        operatorLabel: "Vendors",
        authoritative: { table: "vendors", column: "status_key" },
        domain: "operations",
        settingsTier: "standard",
        settingsVisible: true,
        usageSummary: "Vendor record status labels.",
    },
    {
        entity_type: "service_plan_templates",
        operatorLabel: "Plan templates",
        authoritative: { table: "service_plan_templates", column: "status_key" },
        domain: "operations",
        settingsTier: "standard",
        settingsVisible: true,
        usageSummary: "Service plan template status labels.",
    },
    {
        entity_type: "contacts",
        operatorLabel: "Contacts",
        authoritative: { table: "contacts", column: "status_key" },
        domain: "platform",
        settingsTier: "advanced",
        settingsVisible: true,
        usageSummary: "Legacy contact record status labels.",
    },
    {
        entity_type: "locations",
        operatorLabel: "Locations",
        authoritative: { table: "locations", column: "status_key" },
        domain: "operations",
        settingsTier: "standard",
        settingsVisible: true,
        usageSummary: "Location record active/inactive and related status labels.",
    },
    {
        entity_type: "documents",
        operatorLabel: "Documents",
        authoritative: { table: "documents", column: "status_key" },
        domain: "platform",
        settingsTier: "advanced",
        settingsVisible: true,
        usageSummary: "Document workflow status labels.",
    },
    {
        entity_type: "payments",
        operatorLabel: "Payments",
        authoritative: { table: "payments", column: "status_key" },
        domain: "billing",
        settingsTier: "advanced",
        settingsVisible: true,
        usageSummary: "Payment record status labels.",
    },
    {
        entity_type: "subscriptions",
        operatorLabel: "Subscriptions",
        authoritative: { table: "subscriptions", column: "status_key" },
        domain: "billing",
        settingsTier: "advanced",
        settingsVisible: true,
        usageSummary: "Subscription record status labels.",
    },
];

export function statusCategoryRegistryEntry(
    entityType: string
): StatusCategoryRegistryEntry | undefined {
    return OPERATOR_STATUS_CATEGORY_REGISTRY.find((e) => e.entity_type === entityType);
}

export function operatorStatusCategoryEntityTypes(): string[] {
    return OPERATOR_STATUS_CATEGORY_REGISTRY.filter((e) => e.settingsVisible).map(
        (e) => e.entity_type
    );
}
