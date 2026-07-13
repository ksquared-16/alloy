/**
 * Lifecycle / Business Process — canonical field label resolution for palette entries.
 */

import { resolveCanonicalProviderForConsumer } from "@/lib/fields/consumerCanonicalProviderAssembly";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

const ENTITY_REF_PREFIX: Record<LifecycleRequirementEntityKey, string> = {
    person: "person",
    child: "child",
    opportunity: "opportunity",
    customer: "customer",
};

export function lifecycleRuleRefKey(
    entity: LifecycleRequirementEntityKey,
    fieldKey: string,
): string {
    const prefix = ENTITY_REF_PREFIX[entity];
    if (entity === "child" && fieldKey === "date_of_birth") return "child.date_of_birth";
    if (entity === "child" && fieldKey === "program_category_id") return "inquiry_child.program";
    if (entity === "child" && fieldKey === "schedule_type") return "inquiry_child.schedule_type";
    if (entity === "child" && fieldKey === "program_room_cohort_key") return "child.room";
    if (entity === "child" && fieldKey === "location_id") return "child.location";
    return `${prefix}.${fieldKey}`;
}

export function resolveLifecycleCanonicalFieldLabel(
    entity: LifecycleRequirementEntityKey,
    fieldKey: string | null,
    fallbackLabel: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string {
    if (!fieldKey?.trim()) return fallbackLabel;
    const refKey = lifecycleRuleRefKey(entity, fieldKey);
    const provider = resolveCanonicalProviderForConsumer(refKey, "business_process", {
        tenantFieldDefinitions,
    });
    return provider?.label ?? fallbackLabel;
}
