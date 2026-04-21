import type { QuoteIntakeWorkflowSpec } from "@/lib/quoteIntake/types";

/**
 * Default cleaning quote intake for opportunities — field list is data, not UI code.
 * Option labels/values resolve per org via option_sets + pricing tables (see admin catalog route).
 */
export const OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1: QuoteIntakeWorkflowSpec = {
    workflow_key: "opportunity_cleaning_quote_v1",
    entity_type: "opportunity",
    vertical_slug: "cleaning",
    label: "Cleaning quote",
    fields: [
        {
            id: "sqft_tier",
            quote_input_key: "square_footage",
            label: "Square footage",
            input: "select",
            required: true,
            sort_order: 10,
            option_source: { kind: "cleaning_catalog", key: "square_footage_tiers" },
            pricing_role: "square_footage_tier",
        },
        {
            id: "frequency",
            quote_input_key: "frequency",
            label: "Frequency",
            input: "select",
            required: true,
            sort_order: 20,
            option_source: { kind: "cleaning_catalog", key: "pricing_frequencies" },
            pricing_role: "cleaning_frequency",
        },
        {
            id: "cleaning_type",
            quote_input_key: "cleaning_type",
            label: "Cleaning type",
            input: "select",
            required: true,
            sort_order: 30,
            option_source: { kind: "option_set", set_key: "specialty_cleaning_type" },
            pricing_role: "cleaning_service",
            full_width: true,
        },
        {
            id: "bedrooms",
            quote_input_key: "bedrooms",
            label: "Bedrooms",
            input: "select",
            required: false,
            sort_order: 40,
            option_source: { kind: "option_set", set_key: "bedrooms_booking" },
            pricing_role: "none",
        },
        {
            id: "bathrooms",
            quote_input_key: "bathrooms",
            label: "Bathrooms",
            input: "select",
            required: false,
            sort_order: 50,
            option_source: { kind: "option_set", set_key: "bathrooms_booking" },
            pricing_role: "none",
        },
        {
            id: "addons",
            quote_input_key: "add_ons",
            label: "Add-ons",
            input: "multiselect",
            required: false,
            sort_order: 60,
            option_source: { kind: "cleaning_catalog", key: "addons" },
            pricing_role: "addons",
            full_width: true,
        },
    ],
};

export function getQuoteIntakeWorkflowOrThrow(workflowKey: string): QuoteIntakeWorkflowSpec {
    if (workflowKey === OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1.workflow_key) {
        return OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1;
    }
    throw new Error(`Unknown quote intake workflow: ${workflowKey}`);
}
