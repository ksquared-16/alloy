/**
 * Collection item field catalog — derived from canonical child/inquiry_child providers.
 * Kept separate from collectionFieldPresentation to avoid circular imports with queue-row derivation.
 */

import { assembleQueueRowProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import type { CollectionItemFieldKey } from "@/lib/presentation/collectionFieldPresentation";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type CollectionItemFieldDescriptor = {
    /** Stable collection-item ref — full refKey when custom, legacy key for built-ins. */
    key: CollectionItemFieldKey | string;
    refKey: string;
    label: string;
    resolverBacked: boolean;
};

const LEGACY_COLLECTION_ITEM_REF_KEYS: Record<CollectionItemFieldKey, string> = {
    first_name: "child.first_name",
    last_name: "child.last_name",
    age: "child.age",
    dob: "child.date_of_birth",
    program: "child.program",
    schedule: "child.schedule",
    gender: "child.gender",
};

const COLLECTION_ITEM_NAMESPACE = new Set(["child", "inquiry_child", "candidate"]);

function suffixFromRefKey(refKey: string): string {
    const dot = refKey.indexOf(".");
    return dot >= 0 ? refKey.slice(dot + 1) : refKey;
}

function isCollectionItemProviderRef(refKey: string): boolean {
    const namespace = refKey.includes(".") ? refKey.slice(0, refKey.indexOf(".")) : "";
    return COLLECTION_ITEM_NAMESPACE.has(namespace);
}

export function buildChildrenCollectionItemFieldCatalog(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): Record<string, CollectionItemFieldDescriptor> {
    const providers = assembleQueueRowProviders({ tenantFieldDefinitions });
    const catalog: Record<string, CollectionItemFieldDescriptor> = {};

    for (const [legacyKey, refKey] of Object.entries(LEGACY_COLLECTION_ITEM_REF_KEYS) as [
        CollectionItemFieldKey,
        string,
    ][]) {
        const provider = providers.find((row) => row.refKey === refKey);
        catalog[legacyKey] = {
            key: legacyKey,
            refKey,
            label: provider?.label ?? legacyKey,
            resolverBacked: Boolean(provider),
        };
    }

    for (const provider of providers) {
        if (!isCollectionItemProviderRef(provider.refKey)) continue;
        if (provider.kind === "collection" || provider.kind === "relationship") continue;
        const suffix = suffixFromRefKey(provider.refKey);
        if (catalog[suffix]?.refKey === provider.refKey) continue;
        catalog[suffix] = {
            key: suffix,
            refKey: provider.refKey,
            label: provider.label,
            resolverBacked: true,
        };
    }

    return catalog;
}

export function selectableChildrenCollectionItemFieldKeys(
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string[] {
    return Object.values(buildChildrenCollectionItemFieldCatalog(tenantFieldDefinitions))
        .filter((entry) => entry.resolverBacked)
        .map((entry) => entry.key);
}

export function collectionItemFieldLabel(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string {
    const catalog = buildChildrenCollectionItemFieldCatalog(tenantFieldDefinitions);
    return catalog[fieldKey]?.label ?? fieldKey;
}

export function collectionItemRefKeyForFieldKey(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string | null {
    const catalog = buildChildrenCollectionItemFieldCatalog(tenantFieldDefinitions);
    return catalog[fieldKey]?.refKey ?? null;
}
