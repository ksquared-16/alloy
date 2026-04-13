/**
 * Machine-readable resolution catalog for job record overview layout (semantic planner).
 * Keys align with strict overview layout schema and job RRS overview usage.
 */

import type { JobOverviewResolutionCatalog } from "@/lib/agent/planner/jobOverviewPlannerTypes";

/**
 * v2: contact/service phrasing, `service_key`, explicit capability gaps (phone/email — no overview keys).
 */
export const JOB_OVERVIEW_RESOLUTION_CATALOG: JobOverviewResolutionCatalog = {
    catalog_version: 2,
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
            synonyms: [
                "main contact",
                "primary contact",
                "primary person",
                "primary customer person",
                "contact name",
                "their contact",
            ],
            preferred_band: "people",
            allow_header: true,
        },
        {
            key: "_customer_name",
            synonyms: ["customer name", "account name"],
            preferred_band: "summary",
            allow_header: true,
        },
        {
            key: "_location_label",
            synonyms: ["address", "service address", "location"],
            preferred_band: "summary",
            allow_header: true,
        },
        {
            key: "_next_schedule",
            synonyms: ["next service date", "next service", "next visit", "next schedule", "next appointment"],
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
            key: "service_key",
            synonyms: [
                "what service",
                "service they got",
                "service type",
                "booked service",
                "service booked",
                "type of service",
            ],
            preferred_band: "summary",
            allow_header: true,
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
    capability_gaps: [
        {
            id: "phone",
            synonyms: ["phone", "phones", "telephone", "cell", "mobile"],
            reason:
                "Job overview layout has no canonical system_field for phone today; use org custom fields or relationship UI outside this rail.",
        },
        {
            id: "email",
            synonyms: ["email", "e-mail", "e mail"],
            reason:
                "Job overview layout has no canonical system_field for email today; use org custom fields or relationship UI outside this rail.",
        },
    ],
    service_property_default_items: [
        { kind: "system_field", key: "_service_home_type_label" },
        { kind: "system_field", key: "_service_sqft_band_label" },
        { kind: "system_field", key: "_service_bedrooms" },
        { kind: "system_field", key: "_service_bathrooms" },
    ],
};
