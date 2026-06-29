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

    const services: FinancialServiceInput[] = [
        { label: "Full-Time Care", serviceType: "recurring", unit: "month", sortOrder: 10 },
        { label: "Part-Time Care", serviceType: "recurring", unit: "month", sortOrder: 20 },
        { label: "Before Care", serviceType: "recurring", unit: "week", sortOrder: 30 },
        { label: "After Care", serviceType: "recurring", unit: "week", sortOrder: 40 },
        { label: "Registration", serviceType: "one_time", unit: null, sortOrder: 50 },
        { label: "Meals", serviceType: "attendance_derived", unit: "day", sortOrder: 60 },
        { label: "Transportation", serviceType: "recurring", unit: "week", sortOrder: 70 },
        { label: "Field Trips", serviceType: "one_time", unit: "trip", sortOrder: 80 },
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
                        { scheduleBasis: "drop_in", rateBasis: "daily", amountCents: 8000 },
                    ],
                },
                {
                    effectiveStart: current,
                    billingBasis: "monthly",
                    rules: [
                        { scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 120000 },
                        { scheduleBasis: "three_day", rateBasis: "monthly", amountCents: 82000 },
                        { scheduleBasis: "drop_in", rateBasis: "daily", amountCents: 9000 },
                    ],
                },
                {
                    effectiveStart: future,
                    billingBasis: "monthly",
                    rules: [
                        { scheduleBasis: "five_day", rateBasis: "monthly", amountCents: 130000 },
                        { scheduleBasis: "three_day", rateBasis: "monthly", amountCents: 89000 },
                        { scheduleBasis: "drop_in", rateBasis: "daily", amountCents: 10000 },
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
        // Recurring tuition: rate-derived (priced by Rate Resolution), service-period-anchored,
        // billable next cycle — consumed by schedule.recurring_tuition (Operational Consumption Slice 2).
        { templateKey: "tuition", label: "Recurring Tuition", serviceKey: "full_time_care", chargeCategory: "tuition", triggerType: "schedule", amountStrategy: "rate_derived", occursOn: "service_period_start", billableOn: "next_billing_cycle", reviewRequired: false },
        // Drop-in / extra day: rate-derived at the drop_in rate rule, occurs on the day, billable immediately.
        { templateKey: "drop_in", label: "Drop-In Day", serviceKey: "full_time_care", chargeCategory: "tuition", triggerType: "schedule", amountStrategy: "rate_derived", occursOn: "event_date", billableOn: "immediate", reviewRequired: false },
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
