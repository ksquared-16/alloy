/**
 * Automation field foundation — canonical condition operands and mutation targets.
 *
 * Product UI for process-level automation authoring remains a stub; this module
 * completes the shared editor/model seam without inventing execution behavior.
 */

import { resolveCanonicalConditionOperands, type CanonicalConditionOperand } from "@/lib/fields/canonicalConditionOperands";
import { assembleBusinessProcessProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { providerRefToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { CUSTOMER_MEMBER_ENTITY_TYPE } from "@/lib/fields/customerMemberFieldRegistry";
import { resolveMutationCapability, type MutationCapability } from "@/lib/fields/mutation/resolveMutationCapability";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type AutomationConditionOperand = CanonicalConditionOperand;

export type AutomationMutationTarget = {
    refKey: string;
    label: string;
    categoryKey?: string;
    ownerEntity?: string;
    valueKind: string;
    writable: true;
    mutationCapability: MutationCapability;
};

function tenantMutationCapabilityForProvider(
    providerRef: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): MutationCapability | null {
    const direct = resolveMutationCapability(providerRef);
    if (direct) return direct;

    const trimmed = providerRef.trim();
    const dot = trimmed.indexOf(".");
    if (dot <= 0) return null;
    const namespace = trimmed.slice(0, dot).trim().toLowerCase();
    const fieldKey = trimmed.slice(dot + 1).trim();
    if (!fieldKey) return null;
    if (namespace !== "child" && namespace !== "customer_member" && namespace !== "inquiry_child") return null;

    const tenantRow = tenantFieldDefinitions?.find((row) => {
        const entity = row.entity_type.trim().toLowerCase();
        const key = row.field_key.trim().toLowerCase();
        if (key !== fieldKey.toLowerCase()) return false;
        return entity === CUSTOMER_MEMBER_ENTITY_TYPE || entity === "inquiry_child";
    });
    if (!tenantRow || tenantRow.is_system) return null;

    const canonical =
        providerRefToCanonicalRef(trimmed)
        ?? ({ entity_type: CUSTOMER_MEMBER_ENTITY_TYPE, field_key: fieldKey } as const);

    return {
        provider_ref: trimmed,
        canonical_ref: canonical,
        entity_type: CUSTOMER_MEMBER_ENTITY_TYPE,
        field_key: canonical.field_key,
        storage_class: "config",
        patch_key: canonical.field_key,
        writable: true,
    };
}

export function resolveAutomationConditionOperands(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AutomationConditionOperand[] {
    return resolveCanonicalConditionOperands({
        consumer: "automation_condition",
        filter: { tenantFieldDefinitions },
    });
}

export function resolveAutomationMutationTargets(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AutomationMutationTarget[] {
    const targets: AutomationMutationTarget[] = [];
    for (const provider of assembleBusinessProcessProviders({ tenantFieldDefinitions })) {
        if (provider.kind === "runtime_signal" || provider.kind === "calculated_field") continue;
        if (provider.kind === "collection" && !provider.collectionProjection) continue;
        const capability = tenantMutationCapabilityForProvider(provider.refKey, tenantFieldDefinitions);
        if (!capability?.writable) continue;
        targets.push({
            refKey: provider.refKey,
            label: provider.label,
            categoryKey: provider.categoryKey,
            ownerEntity: provider.entityNamespace,
            valueKind: provider.valueType ?? provider.fieldType ?? "text",
            writable: true,
            mutationCapability: capability,
        });
    }
    return targets.sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveAutomationMutationTarget(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): AutomationMutationTarget | null {
    return (
        resolveAutomationMutationTargets(tenantFieldDefinitions).find((target) => target.refKey === refKey.trim())
        ?? null
    );
}
