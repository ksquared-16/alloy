/**
 * Machine-readable resolution catalog for job record overview layout (semantic planner P0).
 * Keys align with strict overview layout schema and job RRS overview usage.
 */

import type { JobOverviewResolutionCatalog } from "@/lib/agent/planner/jobOverviewPlannerTypes";

export const JOB_OVERVIEW_RESOLUTION_CATALOG: JobOverviewResolutionCatalog = {
    catalog_version: 1,
    band_keys: [
        "summary",
        "people",
        "operational",
        "financial",
        "relationships",
        "service_property",
    ],
    relationship_group_keys: ["primary_customer_person", "customer_account"],
    system_fields: [
        {
            key: "_primary_person_name",
            synonyms: ["main contact", "primary person", "primary customer person", "contact name"],
            preferred_band: "people",
            allow_header: true,
        },
        {
            key: "_customer_name",
            synonyms: ["customer name", "customer", "account name"],
            preferred_band: "summary",
            allow_header: true,
        },
        {
            key: "_location_label",
            synonyms: ["address", "location", "service address"],
            preferred_band: "summary",
            allow_header: true,
        },
        {
            key: "_next_schedule",
            synonyms: ["next service", "next visit", "next schedule", "next appointment"],
            preferred_band: "summary",
            allow_header: true,
        },
        {
            key: "scheduled_at",
            synonyms: ["scheduled", "schedule date"],
            preferred_band: "summary",
            allow_header: false,
        },
        {
            key: "title",
            synonyms: ["job title", "title"],
            preferred_band: "summary",
            allow_header: true,
        },
        {
            key: "display_total_cents",
            synonyms: ["total", "price", "amount"],
            preferred_band: "financial",
            allow_header: false,
        },
    ],
    service_property_default_items: [
        { kind: "system_field", key: "_service_home_type_label" },
        { kind: "system_field", key: "_service_sqft_band_label" },
        { kind: "system_field", key: "_service_bedrooms" },
        { kind: "system_field", key: "_service_bathrooms" },
    ],
};
