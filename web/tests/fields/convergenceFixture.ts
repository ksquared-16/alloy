/**
 * Shared convergence fixture — custom Program-category child Choice field.
 */
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export const CONVERGENCE_FIXTURE_CUSTOM_PROGRAM_DETAIL: TenantFieldDefinitionRow = {
    field_key: "custom_program_detail",
    label: "Custom Program Detail",
    entity_type: "customer_member",
    field_type: "select",
    section_key: "program",
    config: {
        options: [
            { value: "a", label: "Option A" },
            { value: "b", label: "Option B" },
        ],
    },
    is_system: false,
    is_active: true,
};

export const CONVERGENCE_FIXTURE_TENANT_DEFS: readonly TenantFieldDefinitionRow[] = [
    CONVERGENCE_FIXTURE_CUSTOM_PROGRAM_DETAIL,
];

export const CONVERGENCE_FIXTURE_RENAMED: TenantFieldDefinitionRow = {
    ...CONVERGENCE_FIXTURE_CUSTOM_PROGRAM_DETAIL,
    label: "Program Placement Detail",
};
