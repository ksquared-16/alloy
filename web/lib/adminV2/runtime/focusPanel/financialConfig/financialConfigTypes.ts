/**
 * Financial Configuration card — shared types for API and card.
 *
 * Tuition rate resolutions come from the server (DB query in the API route).
 * They are not computable client-side from context.truth alone because
 * commercial_tuition_rates is a separate DB table.
 *
 * @see web/app/api/admin/financial-config/opportunity/[id]/route.ts
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
