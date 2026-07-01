/**
 * Financial Configuration V1 — tuition resolution read model.
 *
 * V1 scope: read-only. Resolves per-child tuition rates from
 * commercial_tuition_rates via the API route. No payer data,
 * no responsibility assignment, no invoices, no payment history.
 *
 * Deferred (no schema): payer responsibility, billing contact write,
 * per-enrollment tuition assignment, invoice generation.
 *
 * @see web/app/api/admin/financial-config/opportunity/[id]/route.ts
 * @see docs/platform/operator/operational-configuration-card-pattern.md
 */

import type { TuitionBillingPeriod } from "@/lib/commercial/tuitionRates";

/** Per-child tuition rate resolution returned by the API route. */
export type FinancialConfigEnrollment = {
    ocmId: string;
    childLabel: string;
    programKey: string | null;
    scheduleKey: string | null;
    locationId: string | null;
    /**
     * Resolved tuition rate, or null when no active rate matches this
     * program + schedule combination in commercial_tuition_rates.
     */
    resolvedRate: {
        rateId: string;
        rateCents: number;
        billingPeriod: TuitionBillingPeriod;
        /** Pre-formatted: "$1,200/month" */
        rateLabel: string;
        /** True when a location-specific rate won over the org default. */
        isLocationOverride: boolean;
    } | null;
};

export type FinancialConfigApiResponse = {
    enrollments: FinancialConfigEnrollment[];
};
