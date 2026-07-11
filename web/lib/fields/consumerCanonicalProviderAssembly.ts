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
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type ConsumerProviderAssemblyFilter = {
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    isWaitlist?: boolean;
    includeLegacyOnly?: boolean;
};

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
    return filterCanonicalDataProviders({
        consumer: "focus_panel",
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist: filter.isWaitlist ?? false,
        includeLegacyOnly: filter.includeLegacyOnly ?? false,
    });
}

export function resolveCanonicalProviderForConsumer(
    refKey: string,
    consumer: CanonicalDataProviderFilter["consumer"],
    filter: ConsumerProviderAssemblyFilter = {},
): CanonicalDataProvider | undefined {
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
