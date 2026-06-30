/**
 * Demo dataset for the Financial Configuration screens (Financial Configuration
 * Convergence). A pure builder that returns a representative set of Services,
 * GL accounts/mappings, and Rate Plans/Rules (current + future + historical
 * versions) so the screens never feel empty during QA. Pure — no DB; the seed
 * route applies it idempotently. Generic platform shape (childcare-flavoured
 * sample values only).
 */

import type { FinancialServiceInput } from "@/lib/financials/services/financialServicesStore";

export type DemoGlAccount = { code: string; name: string; type: string; currency: string };
export type DemoGlMapping = { key: string; accountCode: string };

export type DemoRateRule = {
    scheduleBasis: string;
    rateBasis: string;
    amountCents: number;
    ageGroupKey?: string | null;
};

export type DemoRatePlanVersion = {
    /** Effective start for this version; ordered oldest → newest by the builder. */
    effectiveStart: string;
    billingBasis: string;
    rules: DemoRateRule[];
};

export type DemoRatePlan = {
    planKey: string;
    label: string;
    /** Service key this plan prices (Commercial Model); resolved to service_id at seed time. */
    serviceKey?: string;
    scopeType: "org" | "site" | "program" | "room";
    currencyCode: string;
    calculationStrategy: string;
    /** Versions oldest → newest; the seed supersedes forward to build the timeline. */
    versions: DemoRatePlanVersion[];
};

export type DemoChargeTemplate = {
    templateKey: string;
    label: string;
    /** Service key to attach to (resolved to service_id at seed time); optional. */
    serviceKey?: string;
    chargeCategory: string;
    triggerType: string;
    amountStrategy: string;
    amountCents?: number | null;
    occursOn: string;
    billableOn: string;
    billableOffsetDays?: number | null;
    reviewRequired?: boolean;
};

export type DemoFinancialPolicy = {
    policyType: string;
    scopeType: "org" | "location" | "service" | "rate_plan";
    /** Resolved at seed time: serviceKey → service_id, planKey → rate_plan_id. */
    serviceKey?: string;
    ratePlanKey?: string;
    value: Record<string, unknown>;
};

export type FinancialConfigDemoDataset = {
    services: FinancialServiceInput[];
    glAccounts: DemoGlAccount[];
    glMappings: DemoGlMapping[];
    ratePlans: DemoRatePlan[];
    chargeTemplates: DemoChargeTemplate[];
    policies: DemoFinancialPolicy[];
};

/**
 * Build the demo dataset relative to a pivot year (passed in; the builder never
 * reads the clock). `pivotYear` is "this year"; the dataset includes a prior
 * (historical), current, and next-year (scheduled) rate version.
 */
export function buildFinancialConfigDemoDataset(pivotYear: number): FinancialConfigDemoDataset {
    const prior = `${pivotYear - 1}-01-01`;
    const current = `${pivotYear}-01-01`;
    const future = `${pivotYear + 1}-01-01`;

    // Capability postures by intent (the switchboard). Recurring care powers
    // scheduling/attendance/capacity/waitlist/pricing/portal; one-time and usage
    // offerings switch on far less. Default revenue homes + programs make the
    // Operate canvas feel complete on a fresh seed.
    const careCaps = { creates_schedule: true, tracks_attendance: true, consumes_capacity: true, supports_waitlist: true, uses_rate_plans: true, parent_portal_visible: true };
    const programs = ["Toddler", "Preschool", "Pre-K"];
    const services: FinancialServiceInput[] = [
        { label: "Full-Time Care", serviceType: "recurring", unit: "week", sortOrder: 10, capabilities: careCaps, defaultChargeCategory: "tuition", programs },
        { label: "Part-Time Care", serviceType: "recurring", unit: "week", sortOrder: 20, capabilities: careCaps, defaultChargeCategory: "tuition", programs },
        { label: "Before Care", serviceType: "recurring", unit: "week", sortOrder: 30, capabilities: careCaps, defaultChargeCategory: "tuition", programs: ["Toddler", "Preschool"] },
        { label: "After Care", serviceType: "recurring", unit: "week", sortOrder: 40, capabilities: careCaps, defaultChargeCategory: "tuition", programs: ["Toddler", "Preschool"] },
        { label: "Registration", serviceType: "one_time", unit: null, sortOrder: 50, capabilities: { creates_schedule: false, tracks_attendance: false, consumes_capacity: false, supports_waitlist: false, uses_rate_plans: false, parent_portal_visible: true }, defaultChargeCategory: "fee", programs: [] },
        { label: "Meals", serviceType: "attendance_derived", unit: "day", sortOrder: 60, capabilities: { creates_schedule: false, tracks_attendance: true, consumes_capacity: false, supports_waitlist: false, uses_rate_plans: false, parent_portal_visible: false }, defaultChargeCategory: "consumable_fee", programs: [] },
        { label: "Transportation", serviceType: "recurring", unit: "week", sortOrder: 70, capabilities: { creates_schedule: false, tracks_attendance: false, consumes_capacity: false, supports_waitlist: false, uses_rate_plans: true, parent_portal_visible: true }, defaultChargeCategory: "fee", programs: [] },
        { label: "Field Trips", serviceType: "one_time", unit: "trip", sortOrder: 80, capabilities: { creates_schedule: false, tracks_attendance: false, consumes_capacity: false, supports_waitlist: false, uses_rate_plans: false, parent_portal_visible: true }, defaultChargeCategory: "one_time", programs: [] },
    ];

    const glAccounts: DemoGlAccount[] = [
        { code: "4000", name: "Tuition Revenue", type: "revenue", currency: "USD" },
        { code: "4100", name: "Fee Revenue", type: "revenue", currency: "USD" },
        { code: "4200", name: "Late Fee Revenue", type: "revenue", currency: "USD" },
        { code: "2000", name: "Customer Deposits", type: "liability", currency: "USD" },
    ];

    const glMappings: DemoGlMapping[] = [
        { key: "tuition_revenue", accountCode: "4000" },
        { key: "fee_revenue", accountCode: "4100" },
        { key: "late_fee_revenue", accountCode: "4200" },
        { key: "deposit_liability", accountCode: "2000" },
    ];

    const ratePlans: DemoRatePlan[] = [
        {
            planKey: "standard_tuition",
            label: "Standard Tuition",
            serviceKey: "full_time_care",
            scopeType: "org",
            currencyCode: "USD",
            calculationStrategy: "scheduled",
            versions: [
                {
                    effectiveStart: prior,
                    billingBasis: "monthly",
                    rules: [
                        { scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 110000 },
                        { scheduleBasis: "three_day", rateBasis: "monthly", amountCents: 75000 },
                    ],
                },
                {
                    effectiveStart: current,
                    billingBasis: "monthly",
                    rules: [
                        { scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 120000 },
                        { scheduleBasis: "three_day", rateBasis: "monthly", amountCents: 82000 },
                    ],
                },
                {
                    effectiveStart: future,
                    billingBasis: "monthly",
                    rules: [
                        { scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 130000 },
                        { scheduleBasis: "three_day", rateBasis: "monthly", amountCents: 89000 },
                    ],
                },
            ],
        },
        {
            planKey: "infant_premium",
            label: "Infant Premium",
            scopeType: "org",
            currencyCode: "USD",
            calculationStrategy: "scheduled",
            versions: [
                {
                    effectiveStart: current,
                    billingBasis: "monthly",
                    rules: [{ scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 165000, ageGroupKey: "infant" }],
                },
            ],
        },
    ];

    const chargeTemplates: DemoChargeTemplate[] = [
        { templateKey: "registration_fee", label: "Registration Fee", serviceKey: "registration", chargeCategory: "fee", triggerType: "manual", amountStrategy: "fixed", amountCents: 15000, occursOn: "now", billableOn: "immediate", reviewRequired: false },
        { templateKey: "field_trip", label: "Field Trip", serviceKey: "field_trips", chargeCategory: "one_time", triggerType: "event", amountStrategy: "fixed", amountCents: 4500, occursOn: "event_date", billableOn: "offset_days", billableOffsetDays: 21 },
        { templateKey: "late_pickup", label: "Late Pickup", chargeCategory: "late_pickup", triggerType: "attendance", amountStrategy: "fixed", amountCents: 2500, occursOn: "event_date", billableOn: "immediate", reviewRequired: true },
        { templateKey: "diapers", label: "Diapers / Consumables", serviceKey: "meals", chargeCategory: "consumable_fee", triggerType: "schedule", amountStrategy: "usage_derived", occursOn: "service_period_start", billableOn: "next_billing_cycle" },
        { templateKey: "annual_supply_fee", label: "Annual Supply Fee", chargeCategory: "fee", triggerType: "manual", amountStrategy: "fixed", amountCents: 7500, occursOn: "now", billableOn: "immediate" },
    ];

    const policies: DemoFinancialPolicy[] = [
        { policyType: "proration", scopeType: "org", value: { method: "daily" } },
        { policyType: "billing_cadence", scopeType: "org", value: { cadence: "monthly" } },
        { policyType: "grace_period", scopeType: "org", value: { days: 5 } },
        { policyType: "late_fee", scopeType: "org", value: { amount_cents: 2500, after_days: 10 } },
        { policyType: "posting_review", scopeType: "org", value: { required: true } },
        // Service-specific override: Before Care bills weekly.
        { policyType: "billing_cadence", scopeType: "service", serviceKey: "before_care", value: { cadence: "weekly" } },
        // Rate-plan-specific deposit on the standard tuition plan.
        { policyType: "deposit", scopeType: "rate_plan", ratePlanKey: "standard_tuition", value: { amount_cents: 50000, refundable: true } },
    ];

    return { services, glAccounts, glMappings, ratePlans, chargeTemplates, policies };
}
