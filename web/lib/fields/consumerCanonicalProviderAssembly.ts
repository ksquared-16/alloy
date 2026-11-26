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
import type { CanonicalDataConsumerSurface, CanonicalDataProvider, CanonicalDataProviderFilter } from "@/lib/fields/canonicalDataProviderModel";
import { filterProvidersByConsumerCapability } from "@/lib/fields/capabilityProviderParity";
import { consumerSupportsProviderInPicker } from "@/lib/fields/consumerProviderCapabilities";
import { dedupeCanonicalPickerProviders } from "@/lib/fields/canonicalProviderDedup";
import {
    PLATFORM_FIELD_HUB_ENTITIES,
    platformFieldsForEntityExcludingRegistry,
    type PlatformFieldDefinition,
} from "@/lib/fields/platformFieldCatalog";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { enrichProvidersWithChildEnrollmentProjections } from "@/lib/fields/canonicalFieldProjection";
import { CHILDCARE_STARTER_FIELD_CATALOG } from "@/lib/layout/childcareLayoutFieldCatalog";

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

/** Optional child-enrollment facts (Requested Days, Preferred Weekdays, …) from the starter catalog. */
function providerFromChildcareEnrollmentDetail(
    entry: (typeof CHILDCARE_STARTER_FIELD_CATALOG)[number],
): CanonicalDataProvider {
    return {
        refKey: entry.refKey,
        label: entry.pickerLabel,
        kind: "business_field",
        outputShape: "scalar",
        entityNamespace: namespaceFromRefKey(entry.refKey),
        categoryKey: "inquiry_participation",
        fieldType: entry.fieldType,
        valueType:
            entry.fieldType === "number"
                ? "number"
                : entry.fieldType === "date"
                  ? "date"
                  : entry.fieldType === "multiselect"
                    ? "choice"
                    : "text",
        isSystem: true,
        availability: FOCUS_PANEL_AVAILABILITY,
        source: {
            source: "childcare_layout_catalog",
            sourceModule: "web/lib/layout/childcareLayoutFieldCatalog.ts",
        },
        resolverOwner: entry.storagePath ?? "web/lib/layout/childcareLayoutFieldCatalog.ts",
    };
}

function mergePlatformCatalogProviders(
    base: readonly CanonicalDataProvider[],
    filter: ConsumerProviderAssemblyFilter,
    consumer: CanonicalDataConsumerSurface,
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
            if (!consumerSupportsProviderInPicker(consumer, catalogProvider)) continue;
            merged.set(platformField.refKey, catalogProvider);
        }
    }
    // Focus Panel / drawer Children composition: optional enrollment-detail facts that live
    // on participation metadata (not native OCM columns) must still be pickable.
    if (consumer === "focus_panel" || consumer === "drawer") {
        for (const entry of CHILDCARE_STARTER_FIELD_CATALOG) {
            if (!entry.enrollmentDetail || !entry.refKey.startsWith("inquiry_child.")) continue;
            if (merged.has(entry.refKey)) continue;
            const provider = providerFromChildcareEnrollmentDetail(entry);
            if (!consumerSupportsProviderInPicker(consumer, provider)) continue;
            merged.set(entry.refKey, provider);
        }
    }
    return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function assembleConsumerProviders(
    consumer: CanonicalDataConsumerSurface,
    filter: ConsumerProviderAssemblyFilter = {},
): CanonicalDataProvider[] {
    const base = filterCanonicalDataProviders({
        consumer,
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
        includeLegacyOnly: filter.includeLegacyOnly ?? consumer !== "focus_panel",
    });
    const assembled = dedupeCanonicalPickerProviders(
        mergePlatformCatalogProviders(base, filter, consumer),
        consumer,
    );
    return enrichProvidersWithChildEnrollmentProjections(
        filterProvidersByConsumerCapability(
            assembled,
            consumer,
            filter.tenantFieldDefinitions,
        ),
    );
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
    return assembleConsumerProviders("queue_row", filter);
}

export function assembleBusinessProcessProviders(filter: ConsumerProviderAssemblyFilter = {}): CanonicalDataProvider[] {
    return assembleConsumerProviders("business_process", filter);
}

export function assembleFocusPanelNestedProviders(filter: ConsumerProviderAssemblyFilter = {}): CanonicalDataProvider[] {
    return assembleConsumerProviders("focus_panel", { ...filter, includeLegacyOnly: filter.includeLegacyOnly ?? false });
}

export function assembleDrawerProviders(filter: ConsumerProviderAssemblyFilter = {}): CanonicalDataProvider[] {
    return assembleConsumerProviders("drawer", filter);
}

export function resolveCanonicalProviderForConsumer(
    refKey: string,
    consumer: CanonicalDataProviderFilter["consumer"],
    filter: ConsumerProviderAssemblyFilter = {},
): CanonicalDataProvider | undefined {
    if (
        consumer === "focus_panel"
        || consumer === "queue_row"
        || consumer === "business_process"
        || consumer === "drawer"
    ) {
        const assembly =
            consumer === "focus_panel"
                ? assembleFocusPanelNestedProviders(filter)
                : consumer === "queue_row"
                    ? assembleQueueRowProviders(filter)
                    : consumer === "drawer"
                        ? assembleDrawerProviders(filter)
                        : assembleBusinessProcessProviders(filter);
        return assembly.find((provider) => provider.refKey === refKey.trim());
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
