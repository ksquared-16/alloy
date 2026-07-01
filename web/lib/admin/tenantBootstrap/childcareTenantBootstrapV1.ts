import type { TenantBootstrapPayloadV1 } from "@/lib/admin/tenantBootstrap/types";
import type { VerticalBootstrapPayloadV1 } from "@/lib/admin/verticalBootstrap/types";
import { CHILDCARE_VERTICAL_BOOTSTRAP_V1 } from "@/lib/admin/verticalBootstrap/childcareBootstrapV1";

/**
 * Full-tenant example for childcare: one Growth slice (Enrollment) + scaffold departments so the org
 * tree is believable before those areas are product-complete.
 */
const STRUCTURAL: VerticalBootstrapPayloadV1 = {
    ...CHILDCARE_VERTICAL_BOOTSTRAP_V1,
    departments: [
        {
            key: "enrollment",
            name: "Enrollment",
            description: "Family inquiries, tours, quotes, and enrollment — primary Growth surface.",
            sort_order: 10,
            is_active: true,
            metadata: {
                tenant_slice: "growth",
                onboarding_lane: "primary",
                audience: "families",
                growth_capabilities: ["opportunity_pipeline", "queues", "lifecycle"],
            },
        },
        {
            key: "operations",
            name: "Operations",
            description: "Center operations, staffing, and facilities (scaffold).",
            sort_order: 20,
            is_active: true,
            metadata: {
                tenant_slice: "scaffold",
                scaffold_note: "Visible structure; workflows TBD.",
            },
        },
        {
            key: "finance",
            name: "Finance",
            description: "Billing, subsidies, and receivables (scaffold).",
            sort_order: 30,
            is_active: true,
            metadata: {
                tenant_slice: "scaffold",
                scaffold_note: "Visible structure; workflows TBD.",
            },
        },
        {
            key: "compliance",
            name: "Compliance",
            description: "Licensing, ratios, and policy tracking (scaffold).",
            sort_order: 40,
            is_active: true,
            metadata: {
                tenant_slice: "scaffold",
                scaffold_note: "Visible structure; workflows TBD.",
            },
        },
        {
            key: "system",
            name: "System",
            description: "Internal admin, integrations, and configuration (scaffold).",
            sort_order: 50,
            is_active: true,
            metadata: {
                tenant_slice: "scaffold",
                scaffold_note: "Visible structure; workflows TBD.",
            },
        },
    ],
    work_units: [
        ...CHILDCARE_VERTICAL_BOOTSTRAP_V1.work_units,
        {
            department_key: "operations",
            key: "ops_board",
            name: "Operations board",
            description: "Placeholder queue until job/ops entities are wired.",
            sort_order: 0,
            is_active: true,
            queue_definition: {},
            metadata: { tenant_slice: "scaffold", placeholder: true },
        },
        {
            department_key: "finance",
            key: "finance_inbox",
            name: "Finance inbox",
            description: "Placeholder for billing tasks.",
            sort_order: 0,
            is_active: true,
            queue_definition: {},
            metadata: { tenant_slice: "scaffold", placeholder: true },
        },
        {
            department_key: "compliance",
            key: "compliance_inbox",
            name: "Compliance inbox",
            description: "Placeholder for compliance tasks.",
            sort_order: 0,
            is_active: true,
            queue_definition: {},
            metadata: { tenant_slice: "scaffold", placeholder: true },
        },
        {
            department_key: "system",
            key: "internal",
            name: "Internal",
            description: "Placeholder for system/admin work.",
            sort_order: 0,
            is_active: true,
            queue_definition: {},
            metadata: { tenant_slice: "scaffold", placeholder: true },
        },
    ],
};

export const CHILDCARE_TENANT_BOOTSTRAP_V1: TenantBootstrapPayloadV1 = {
    schema_version: 1,
    org_profile: {
        industry_key: "childcare",
        industry_label: "Childcare & early learning",
        display_name_hint: "Brightcare Learning Center",
    },
    growth_department_keys: ["enrollment"],
    terminology: CHILDCARE_VERTICAL_BOOTSTRAP_V1.onboarding_context?.terminology,
    structural_config: STRUCTURAL,
    starter_seed: {
        deferred: true,
        reference: "childcare_v1",
    },
};
