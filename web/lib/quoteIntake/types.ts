/**
 * Platform quote intake — configurable field lists for opportunity (or future entities)
 * without a separate quote entity. Workflows reference option/catalog sources; the admin
 * API resolves options per org.
 */

export type QuoteIntakeEntity = "opportunity";

/** Declares where resolved options come from (resolved server-side for admin org). */
export type QuoteIntakeOptionSource =
    | { kind: "cleaning_catalog"; key: "square_footage_tiers" }
    | { kind: "cleaning_catalog"; key: "pricing_frequencies" }
    | { kind: "cleaning_catalog"; key: "addons" }
    | { kind: "option_set"; set_key: string };

export type QuoteIntakeInputKind = "select" | "multiselect";

/** Pricing pipeline role — used to map UI values into PATCH / pricing normalization. */
export type QuoteIntakePricingRole =
    | "square_footage_tier"
    | "cleaning_frequency"
    | "cleaning_service"
    | "addons"
    | "none";

export type QuoteIntakeFieldSpec = {
    /** Stable id within the workflow (for React keys + future agent config). */
    id: string;
    /** Key written under `quote_inputs` on the opportunity. */
    quote_input_key: string;
    label: string;
    input: QuoteIntakeInputKind;
    required: boolean;
    sort_order: number;
    option_source: QuoteIntakeOptionSource;
    pricing_role: QuoteIntakePricingRole;
    /** Optional: span full width in the grid. */
    full_width?: boolean;
};

export type QuoteIntakeWorkflowSpec = {
    workflow_key: string;
    entity_type: QuoteIntakeEntity;
    vertical_slug: string;
    label: string;
    fields: QuoteIntakeFieldSpec[];
};

/** Resolved field for rendering (options filled by GET /api/admin/quote-intake/catalog). */
export type QuoteIntakeResolvedField = QuoteIntakeFieldSpec & {
    options: { value: string; label: string; meta?: { price?: number } }[];
};

export type QuoteIntakeCatalogResponse = {
    ok: true;
    workflow_key: string;
    workflow: QuoteIntakeWorkflowSpec;
    vertical_id: string;
    fields: QuoteIntakeResolvedField[];
};
