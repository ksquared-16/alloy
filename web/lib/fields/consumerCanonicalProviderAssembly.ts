/**
 * Consumer-facing canonical provider assembly — thin adapters over canonicalDataProviderRegistry.
 *
 * Queue Rows and Forms apply capability filters here; they must not maintain parallel provider
 * identity catalogs.
 */

import {
    filterCanonicalDataProviders,
    findCanonicalDataProvider,
    publishableQueueRowRefKeys,
} from "@/lib/fields/canonicalDataProviderRegistry";
import type { CanonicalDataProvider, CanonicalDataProviderFilter } from "@/lib/fields/canonicalDataProviderModel";
import { consumerSupportsProviderInPicker } from "@/lib/fields/consumerProviderCapabilities";
import { dedupeFocusPanelPickerProviders } from "@/lib/fields/focusPanelProviderDedup";
import {
    PLATFORM_FIELD_HUB_ENTITIES,
    platformFieldsForEntityExcludingRegistry,
    type PlatformFieldDefinition,
} from "@/lib/fields/platformFieldCatalog";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type ConsumerProviderAssemblyFilter = {
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    isWaitlist?: boolean;
    includeLegacyOnly?: boolean;
};

const FOCUS_PANEL_AVAILABILITY: CanonicalDataProvider["availability"] = { pipeline: true, waitlist: true };

function namespaceFromRefKey(refKey: string): string {
    const dot = refKey.indexOf(".");
    return dot >= 0 ? refKey.slice(0, dot) : "opportunity";
}

function providerFromPlatformFieldCatalog(field: PlatformFieldDefinition): CanonicalDataProvider {
    return {
        refKey: field.refKey,
        label: field.label,
        kind: "platform_field",
        outputShape: "scalar",
        entityNamespace: namespaceFromRefKey(field.refKey),
        categoryKey: field.section_key,
        fieldType: field.field_type,
        isSystem: true,
        availability: FOCUS_PANEL_AVAILABILITY,
        source: {
            source: "platform_field_catalog",
            sourceModule: "web/lib/fields/platformFieldCatalog.ts",
        },
        resolverOwner: "web/lib/fields/platformFieldCatalog.ts",
    };
}

function mergePlatformCatalogProviders(
    base: readonly CanonicalDataProvider[],
    filter: ConsumerProviderAssemblyFilter,
): CanonicalDataProvider[] {
    const merged = new Map<string, CanonicalDataProvider>(base.map((provider) => [provider.refKey, provider]));
    const tenantKeysByEntity = new Map<string, Set<string>>();
    for (const def of filter.tenantFieldDefinitions ?? []) {
        const entityType = def.entity_type.trim().toLowerCase();
        const keys = tenantKeysByEntity.get(entityType) ?? new Set<string>();
        keys.add(def.field_key.trim().toLowerCase());
        tenantKeysByEntity.set(entityType, keys);
    }
    for (const entityType of PLATFORM_FIELD_HUB_ENTITIES) {
        for (const platformField of platformFieldsForEntityExcludingRegistry(
            entityType,
            tenantKeysByEntity.get(entityType) ?? new Set<string>(),
        )) {
            const existing = merged.get(platformField.refKey);
            if (existing) {
                merged.set(platformField.refKey, {
                    ...existing,
                    label: existing.label || platformField.label,
                    categoryKey: existing.categoryKey ?? platformField.section_key,
                });
                continue;
            }
            const catalogProvider = providerFromPlatformFieldCatalog(platformField);
            if (!consumerSupportsProviderInPicker("focus_panel", catalogProvider)) continue;
            merged.set(platformField.refKey, catalogProvider);
        }
    }
    return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function assembleFormsDocumentProviders(filter: ConsumerProviderAssemblyFilter = {}): CanonicalDataProvider[] {
    return filterCanonicalDataProviders({
        consumer: "forms",
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
        includeLegacyOnly: filter.includeLegacyOnly ?? true,
    });
}

export function assembleQueueRowProviders(filter: ConsumerProviderAssemblyFilter = {}): CanonicalDataProvider[] {
    return filterCanonicalDataProviders({
        consumer: "queue_row",
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
        includeLegacyOnly: filter.includeLegacyOnly ?? true,
    });
}

export function assembleFocusPanelNestedProviders(filter: ConsumerProviderAssemblyFilter = {}): CanonicalDataProvider[] {
    const base = filterCanonicalDataProviders({
        consumer: "focus_panel",
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
        includeLegacyOnly: filter.includeLegacyOnly ?? false,
    });
    return dedupeFocusPanelPickerProviders(mergePlatformCatalogProviders(base, filter));
}

export function resolveCanonicalProviderForConsumer(
    refKey: string,
    consumer: CanonicalDataProviderFilter["consumer"],
    filter: ConsumerProviderAssemblyFilter = {},
): CanonicalDataProvider | undefined {
    if (consumer === "focus_panel") {
        return assembleFocusPanelNestedProviders(filter).find((provider) => provider.refKey === refKey.trim());
    }
    const provider = findCanonicalDataProvider(refKey, {
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
    });
    if (!provider) return undefined;
    const allowed = filterCanonicalDataProviders({
        consumer,
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
        includeLegacyOnly: filter.includeLegacyOnly ?? true,
    });
    return allowed.find((p) => p.refKey === provider.refKey);
}

export { publishableQueueRowRefKeys };
