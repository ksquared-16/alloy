/**
 * Shape for post-bootstrap demo/starter data (configuration first, data second).
 * Not applied by vertical-bootstrap — a future `seedChildcareDemo(orgId)` would consume this contract.
 */

export type ChildcareStarterOpportunitySeed = {
    /** Stable handle for idempotent seed scripts */
    seed_key: string;
    title: string;
    status_key: string;
    /** Routes the row into a work unit via queue filters (status / quote state) */
    work_unit_hint: "early_inquiries" | "quoting" | "priced_followup" | "pipeline_overview";
    quote_total_cents?: number | null;
    notes?: string;
};

export type ChildcareStarterSeedV1 = {
    schema_version: 1;
    vertical_key: "childcare";
    opportunities: ChildcareStarterOpportunitySeed[];
};

/** Example distribution: one row per primary queue + one closed outcome — replace titles with realistic copy in seeder. */
export const CHILDCARE_STARTER_SEED_V1_EXAMPLE: ChildcareStarterSeedV1 = {
    schema_version: 1,
    vertical_key: "childcare",
    opportunities: [
        {
            seed_key: "demo_inquiry_new",
            title: "Martinez — infant room waitlist",
            status_key: "new",
            work_unit_hint: "early_inquiries",
            quote_total_cents: null,
        },
        {
            seed_key: "demo_inquiry_quoting",
            title: "Nguyen — preschool tour + quote",
            status_key: "needs_a_quote",
            work_unit_hint: "quoting",
            quote_total_cents: null,
        },
        {
            seed_key: "demo_inquiry_priced",
            title: "Patel — full-time care quote sent",
            status_key: "quoted",
            work_unit_hint: "priced_followup",
            quote_total_cents: 125000,
        },
    ],
};
