/**
 * Canonical data-provider registry — single adapter for configurable consumers.
 *
 * Merges platform seeds, tenant field_definitions, and legacy compatibility refs.
 * Consumers filter through consumerProviderCapabilities — no parallel catalogs.
 *
 * Dependency direction:
 *   canonicalDataProviderModel → consumerProviderCapabilities → this module
 *   → queueRecordValidatorAllowList / compositionFieldAdapter / canonicalBuilderFieldLibrary
 *   fieldResolverRegistry reads queueRowRuntimeResolution (not validator directly)
 */

import type {
    CanonicalDataProvider,
    CanonicalDataProviderFilter,
} from "@/lib/fields/canonicalDataProviderModel";
import {
    consumerSupportsProviderAtPublish,
    consumerSupportsProviderInPicker,
} from "@/lib/fields/consumerProviderCapabilities";
import { buildQueueRowProviderSeeds } from "@/lib/fields/canonicalDataProviderSeeds";
import {
    buildFormsProviderSeeds,
    mergeFormsProviderCatalog,
} from "@/lib/fields/canonicalFormsProviderDerivation";
import type { FieldDefinitionPickerRow } from "@/lib/fields/formFieldRegistryPicker";
import { filterFormsDocumentsPickerProviders } from "@/lib/fields/formsProviderEligibility";
import {
    isLegacyQueueRowCompatibilityRefKey,
    LEGACY_QUEUE_ROW_COMPATIBILITY_REFS,
    legacyQueueRowCompatibilityEntry,
} from "@/lib/fields/queueRowLegacyCompatibility";
import {
    buildTenantLayoutCatalogFields,
    type TenantFieldDefinitionRow,
    type TenantLayoutFieldSurface,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { isChildcareOperatorPickerVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { isWaitlistOnlyFieldKey } from "@/lib/layout/runtime/queueWaitlistPlacementField";

let cachedSeeds: CanonicalDataProvider[] | null = null;
let cachedFormsSeeds: CanonicalDataProvider[] | null = null;

function queueLayoutSurface(isWaitlist: boolean): TenantLayoutFieldSurface {
    return isWaitlist ? "waitlist_queue_row" : "pipeline_queue_row";
}

function namespaceFromRefKey(refKey: string): string {
    const dot = refKey.indexOf(".");
    return dot >= 0 ? refKey.slice(0, dot) : "opportunity";
}

function tenantProviders(
    defs: readonly TenantFieldDefinitionRow[],
    isWaitlist: boolean,
): CanonicalDataProvider[] {
    const surface = queueLayoutSurface(isWaitlist);
    return buildTenantLayoutCatalogFields(defs, surface)
        .filter((field) => {
            const entity = namespaceFromRefKey(field.refKey);
            const fieldKey = field.refKey.includes(".") ? field.refKey.slice(field.refKey.indexOf(".") + 1) : field.refKey;
            const def = defs.find(
                (d) =>
                    `${d.entity_type}.${d.field_key}` === field.refKey
                    || (d.entity_type === "customer_member" && `child.${d.field_key}` === field.refKey),
            );
            return isChildcareOperatorPickerVisible(entity === "child" ? "inquiry_child" : entity, fieldKey, {
                is_system: def?.is_system,
                config: def?.config ?? undefined,
            });
        })
        .map((field) => ({
            refKey: field.refKey,
            label: field.fieldLabel,
            kind: "business_field" as const,
            outputShape: "scalar" as const,
            entityNamespace: namespaceFromRefKey(field.refKey),
            fieldType: field.fieldType,
            isSystem: false,
            availability: { pipeline: true, waitlist: true },
            source: {
                source: "field_definitions",
                sourceModule: "web/lib/layout/tenantLayoutFieldPickerCatalog.ts",
            },
            resolverOwner: "web/lib/layout/tenantLayoutFieldPickerCatalog.ts",
        }));
}

function allSeedProviders(): CanonicalDataProvider[] {
    if (!cachedSeeds) {
        cachedSeeds = buildQueueRowProviderSeeds();
    }
    return cachedSeeds;
}

function allFormsSeedProviders(): CanonicalDataProvider[] {
    if (!cachedFormsSeeds) {
        cachedFormsSeeds = buildFormsProviderSeeds();
    }
    return cachedFormsSeeds;
}

/** Reset cached seeds — test helper only. */
export function resetCanonicalDataProviderCacheForTests(): void {
    cachedSeeds = null;
    cachedFormsSeeds = null;
}

export function buildFormsDocumentsProviderCatalog(options?: {
    tenantFieldDefinitions?: readonly FieldDefinitionPickerRow[];
}): CanonicalDataProvider[] {
    const tenant = options?.tenantFieldDefinitions;
    if (tenant?.length) {
        return mergeFormsProviderCatalog(tenant);
    }
    return [...allFormsSeedProviders()];
}

export function findFormsDocumentsDataProvider(
    refKey: string,
    options?: { tenantFieldDefinitions?: readonly FieldDefinitionPickerRow[] },
): CanonicalDataProvider | undefined {
    const trimmed = refKey.trim();
    return buildFormsDocumentsProviderCatalog(options).find((p) => p.refKey === trimmed);
}

export function filterFormsDocumentsDataProviders(options?: {
    tenantFieldDefinitions?: readonly FieldDefinitionPickerRow[];
    includeLegacyOnly?: boolean;
}): CanonicalDataProvider[] {
    const catalog = buildFormsDocumentsProviderCatalog({
        tenantFieldDefinitions: options?.tenantFieldDefinitions,
    });
    return filterFormsDocumentsPickerProviders(
        catalog.filter((provider) => options?.includeLegacyOnly || !provider.legacyOnly),
    );
}

export function isFormsDocumentsProviderPublishable(
    refKey: string,
    tenantFieldDefinitions?: readonly FieldDefinitionPickerRow[],
): boolean {
    const provider = findFormsDocumentsDataProvider(refKey, { tenantFieldDefinitions });
    if (!provider) return false;
    return consumerSupportsProviderAtPublish("forms", provider, false);
}

export function buildCanonicalDataProviderCatalog(options?: {
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    isWaitlist?: boolean;
}): CanonicalDataProvider[] {
    const isWaitlist = options?.isWaitlist ?? false;
    const seen = new Map<string, CanonicalDataProvider>();
    for (const provider of allSeedProviders()) {
        seen.set(provider.refKey, provider);
    }
    if (options?.tenantFieldDefinitions?.length) {
        for (const provider of tenantProviders(options.tenantFieldDefinitions, isWaitlist)) {
            seen.set(provider.refKey, provider);
        }
        for (const provider of tenantProviders(options.tenantFieldDefinitions, !isWaitlist)) {
            if (!seen.has(provider.refKey)) seen.set(provider.refKey, provider);
        }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function findCanonicalDataProvider(
    refKey: string,
    options?: { tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[]; isWaitlist?: boolean },
): CanonicalDataProvider | undefined {
    const trimmed = refKey.trim();
    return buildCanonicalDataProviderCatalog(options).find((p) => p.refKey === trimmed);
}

export function filterCanonicalDataProviders(filter: CanonicalDataProviderFilter): CanonicalDataProvider[] {
    const isWaitlist = filter.isWaitlist ?? false;
    const catalog = buildCanonicalDataProviderCatalog({
        tenantFieldDefinitions: filter.tenantFieldDefinitions,
        isWaitlist,
    });
    return catalog.filter((provider) => {
        if (provider.legacyOnly && !filter.includeLegacyOnly) return false;
        if (filter.kinds && !filter.kinds.includes(provider.kind)) return false;
        if (filter.shapes && !filter.shapes.includes(provider.outputShape)) return false;
        const layoutKind = isWaitlist ? provider.availability.waitlist : provider.availability.pipeline;
        if (!layoutKind) return false;
        return consumerSupportsProviderInPicker(filter.consumer, provider);
    });
}

export function isCanonicalProviderPublishable(
    refKey: string,
    consumer: CanonicalDataProviderFilter["consumer"],
    isWaitlist: boolean,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): boolean {
    const trimmed = refKey.trim();
    const provider = findCanonicalDataProvider(trimmed, { tenantFieldDefinitions, isWaitlist });
    if (provider) {
        return consumerSupportsProviderAtPublish(consumer, provider, isWaitlist);
    }
    return isLegacyQueueRowCompatibilityRefKey(trimmed);
}

export function publishableQueueRowRefKeys(
    isWaitlist: boolean,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): readonly string[] {
    const fromCatalog = buildCanonicalDataProviderCatalog({ tenantFieldDefinitions, isWaitlist }).filter((p) =>
        consumerSupportsProviderAtPublish("queue_row", p, isWaitlist),
    );
    const keys = new Set(fromCatalog.map((p) => p.refKey));
    for (const legacy of LEGACY_QUEUE_ROW_COMPATIBILITY_REFS) {
        const entry = legacyQueueRowCompatibilityEntry(legacy);
        if (!entry?.publishes) continue;
        if (entry.waitlistOnly && !isWaitlist) continue;
        keys.add(legacy);
    }
    return [...keys].sort();
}
