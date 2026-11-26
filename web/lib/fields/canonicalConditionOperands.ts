/**
 * Shared canonical condition operand resolver — Work Views, process conditions, automations.
 *
 * Flow: canonical providers → comparison capabilities → consumer filter → operand options.
 * Does not own operator presentation grammar or consumer UI details.
 */

import type { CanonicalDataConsumerSurface, CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import {
    comparisonCapabilitiesForProvider,
    providerSupportsConditionComparison,
    type CanonicalComparisonCapabilities,
} from "@/lib/fields/canonicalComparisonCapabilities";
import {
    assembleBusinessProcessProviders,
    type ConsumerProviderAssemblyFilter,
} from "@/lib/fields/consumerCanonicalProviderAssembly";
import { consumerSupportsProviderInPicker } from "@/lib/fields/consumerProviderCapabilities";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type CanonicalConditionOperandConsumer =
    | "work_view"
    | "process_condition"
    | "transition_condition"
    | "automation_condition";

export type CanonicalConditionOperand = {
    refKey: string;
    providerRef: string;
    label: string;
    categoryKey?: string;
    categoryLabel?: string;
    ownerEntity?: string;
    valueKind: string;
    valueType: string;
    optionSetRef?: string;
    capabilities: CanonicalComparisonCapabilities;
    runtimeSupported: boolean;
    excludedReason?: string;
};

export type ResolveCanonicalConditionOperandsArgs = {
    consumer: CanonicalConditionOperandConsumer;
    entityContext?: readonly string[];
    filter?: ConsumerProviderAssemblyFilter;
};

function assembleProvidersForConditionConsumer(
    consumer: CanonicalConditionOperandConsumer,
    filter: ConsumerProviderAssemblyFilter = {},
): CanonicalDataProvider[] {
    switch (consumer) {
        case "work_view":
        case "process_condition":
        case "transition_condition":
        case "automation_condition":
            return assembleBusinessProcessProviders(filter);
        default:
            return assembleBusinessProcessProviders(filter);
    }
}

function canonicalSurfaceForConsumer(consumer: CanonicalConditionOperandConsumer): CanonicalDataConsumerSurface {
    return consumer === "automation_condition" ? "business_process" : "business_process";
}

function valueKindForProvider(provider: CanonicalDataProvider): string {
    switch (provider.valueType) {
        case "date":
            return "date_preset";
        case "boolean":
            return "boolean";
        case "choice":
        case "status":
            return "choice_select";
        case "number":
            return "number";
        default:
            if (provider.fieldType === "select" || provider.fieldType === "multiselect") return "choice_select";
            if (provider.fieldType === "date" || provider.fieldType === "datetime") return "date_preset";
            if (provider.fieldType === "boolean") return "boolean";
            if (provider.fieldType === "number" || provider.fieldType === "currency") return "number";
            return "text";
    }
}

function categoryLabelFromKey(categoryKey: string | undefined): string | undefined {
    if (!categoryKey?.trim()) return undefined;
    return categoryKey
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function optionSetRefForProvider(
    provider: CanonicalDataProvider,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string | undefined {
    const fieldKey = provider.refKey.includes(".") ? provider.refKey.slice(provider.refKey.indexOf(".") + 1) : provider.refKey;
    const entityNamespace = provider.entityNamespace.trim().toLowerCase();
    const tenantMatch = tenantFieldDefinitions?.find((row) => {
        const entity = row.entity_type.trim().toLowerCase();
        const key = row.field_key.trim().toLowerCase();
        if (key !== fieldKey.trim().toLowerCase()) return false;
        if (entityNamespace === "child" || entityNamespace === "inquiry_child") {
            return entity === "customer_member" || entity === "inquiry_child";
        }
        return entity === entityNamespace || entity === "opportunity" && entityNamespace === "opportunity";
    });
    const config = tenantMatch?.config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
        const optionSetKey = (config as Record<string, unknown>).option_set_key;
        if (typeof optionSetKey === "string" && optionSetKey.trim()) return optionSetKey.trim();
    }
    return undefined;
}

function passesEntityContext(provider: CanonicalDataProvider, entityContext?: readonly string[]): boolean {
    if (!entityContext?.length) return true;
    const namespace = provider.entityNamespace.trim().toLowerCase();
    return entityContext.some((entity) => entity.trim().toLowerCase() === namespace);
}

function passesConsumerFilter(
    consumer: CanonicalConditionOperandConsumer,
    provider: CanonicalDataProvider,
): boolean {
    const surface = canonicalSurfaceForConsumer(consumer);
    if (!consumerSupportsProviderInPicker(surface, provider)) return false;
    if (!providerSupportsConditionComparison(provider)) return false;
    if (provider.kind === "collection" && !provider.collectionProjection) return false;
    return true;
}

export function providerToCanonicalConditionOperand(
    provider: CanonicalDataProvider,
    args: {
        tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
        runtimeSupported?: boolean;
        excludedReason?: string;
    } = {},
): CanonicalConditionOperand {
    return {
        refKey: provider.refKey,
        providerRef: provider.refKey,
        label: provider.label,
        categoryKey: provider.categoryKey,
        categoryLabel: categoryLabelFromKey(provider.categoryKey),
        ownerEntity: provider.entityNamespace,
        valueKind: valueKindForProvider(provider),
        valueType: provider.valueType ?? "unknown",
        optionSetRef: optionSetRefForProvider(provider, args.tenantFieldDefinitions),
        capabilities: comparisonCapabilitiesForProvider(provider),
        runtimeSupported: args.runtimeSupported ?? true,
        excludedReason: args.excludedReason,
    };
}

export function resolveCanonicalConditionOperands(
    args: ResolveCanonicalConditionOperandsArgs,
): CanonicalConditionOperand[] {
    const filter = args.filter ?? {};
    const providers = assembleProvidersForConditionConsumer(args.consumer, filter);
    const operationalKeys = new Set<string>();

    const operands: CanonicalConditionOperand[] = [];
    for (const provider of providers) {
        if (!passesEntityContext(provider, args.entityContext)) continue;
        if (!passesConsumerFilter(args.consumer, provider)) continue;
        if (operationalKeys.has(provider.refKey)) continue;
        operationalKeys.add(provider.refKey);
        operands.push(
            providerToCanonicalConditionOperand(provider, {
                tenantFieldDefinitions: filter.tenantFieldDefinitions,
            }),
        );
    }

    return operands.sort((a, b) => a.label.localeCompare(b.label));
}
