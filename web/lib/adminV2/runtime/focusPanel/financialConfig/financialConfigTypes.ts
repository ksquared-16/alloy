/**
 * Assignment tuition — the read model an operator surface renders.
 *
 * Read-only: resolution belongs to Commercial Execution and the DECISION belongs to the registered
 * `enrollment.pricing.accept` / `.override` actions. Nothing here writes, and nothing here creates
 * a charge.
 *
 * `FinancialConfigEnrollment` is the ORIGINAL, narrower shape and is kept because callers already
 * read it. It carries a rate only when the resolution is deterministic — an ambiguous assignment
 * leaves it null rather than handing one of several equally-valid answers to a caller who cannot
 * tell. `assignments` carries the full picture: state, alternatives, explanation, what was accepted,
 * and whether the assignment has moved since it was.
 *
 * The note this file used to carry — "deferred (no schema): per-enrollment tuition assignment" — is
 * why Thread 3 exists. The schema is `enrollment_pricing_terms`.
 *
 * @see web/app/api/admin/financial-config/opportunity/[id]/route.ts
 * @see web/lib/enrollment/pricing/buildAssignmentTuitionView.ts
 */

import type { AssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";

/** Per-child tuition rate resolution returned by the API route. */
export type FinancialConfigEnrollment = {
    ocmId: string;
    childLabel: string;
    programKey: string | null;
    scheduleKey: string | null;
    locationId: string | null;
    /**
     * The recommended tuition, or null when the resolution is ambiguous, matches nothing, or the
     * assignment facts are incomplete. Never one of several tied candidates.
     */
    resolvedRate: {
        rateId: string;
        rateCents: number;
        /** `billing_cadences` item key — Commercial's own billing-frequency vocabulary. */
        billingPeriod: string;
        /** Pre-formatted: "$1,200/month" */
        rateLabel: string;
        /** True when a location-specific rate won over the org default. */
        isLocationOverride: boolean;
    } | null;
};

export type FinancialConfigApiResponse = {
    enrollments: FinancialConfigEnrollment[];
    /** The full assignment tuition view — state, alternatives, explanation, accepted term. */
    assignments: AssignmentTuitionView[];
};
