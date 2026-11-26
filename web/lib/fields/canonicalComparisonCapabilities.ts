/**
 * Canonical comparison and sort capabilities — derived from provider value metadata.
 * Consumers apply narrower filters; this module does not own field identity or labels.
 */

import type { CanonicalDataProvider, CanonicalDataValueType } from "@/lib/fields/canonicalDataProviderModel";
import type { WorkViewFilterOperatorV1 } from "@/lib/lifecycle/workViewsConfigV1";

export type CanonicalComparisonCapabilities = {
    equality?: boolean;
    ordering?: boolean;
    emptiness?: boolean;
    membership?: boolean;
    contains?: boolean;
    dateComparison?: boolean;
    numericComparison?: boolean;
};

const SELECT_OPERATORS: readonly WorkViewFilterOperatorV1[] = [
    "equals",
    "not_equals",
    "is_any_of",
    "is_empty",
    "is_not_empty",
];

const BOOLEAN_OPERATORS: readonly WorkViewFilterOperatorV1[] = ["equals", "not_equals"];

const DATE_OPERATORS: readonly WorkViewFilterOperatorV1[] = ["equals", "date_is", "is_empty", "is_not_empty"];

const TEXT_OPERATORS: readonly WorkViewFilterOperatorV1[] = [
    "equals",
    "not_equals",
    "is_empty",
    "is_not_empty",
];

export function comparisonCapabilitiesForValueType(
    valueType: CanonicalDataValueType | undefined,
    fieldType?: string,
): CanonicalComparisonCapabilities {
    switch (valueType) {
        case "number":
            return {
                equality: true,
                ordering: true,
                emptiness: true,
                membership: true,
                numericComparison: true,
            };
        case "date":
            return {
                equality: true,
                ordering: true,
                emptiness: true,
                dateComparison: true,
            };
        case "boolean":
            return { equality: true, emptiness: false };
        case "choice":
        case "status":
            return { equality: true, emptiness: true, membership: true, ordering: true };
        case "text":
        case "link":
            return { equality: true, emptiness: true, contains: true };
        default:
            if (fieldType === "number" || fieldType === "currency") {
                return {
                    equality: true,
                    ordering: true,
                    emptiness: true,
                    membership: true,
                    numericComparison: true,
                };
            }
            if (fieldType === "date" || fieldType === "datetime") {
                return {
                    equality: true,
                    ordering: true,
                    emptiness: true,
                    dateComparison: true,
                };
            }
            if (fieldType === "boolean") {
                return { equality: true };
            }
            if (fieldType === "select" || fieldType === "multiselect" || fieldType === "status") {
                return { equality: true, emptiness: true, membership: true, ordering: true };
            }
            return { equality: true, emptiness: true };
    }
}

export function comparisonCapabilitiesForProvider(provider: CanonicalDataProvider): CanonicalComparisonCapabilities {
    if (provider.kind === "collection" && !provider.collectionProjection) {
        return {};
    }
    if (provider.kind === "relationship" && provider.relationship) {
        return { equality: true, emptiness: true };
    }
    if (provider.kind === "runtime_signal") {
        return { equality: true, emptiness: true };
    }
    if (provider.kind === "calculated_field") {
        const base = comparisonCapabilitiesForValueType(provider.valueType, provider.fieldType);
        return { ...base, ordering: base.ordering ?? (provider.valueType === "number" || provider.valueType === "date") };
    }
    return comparisonCapabilitiesForValueType(provider.valueType, provider.fieldType);
}

export function providerSupportsConditionComparison(provider: CanonicalDataProvider): boolean {
    const caps = comparisonCapabilitiesForProvider(provider);
    return Boolean(caps.equality || caps.dateComparison || caps.numericComparison || caps.membership);
}

export function providerSupportsSort(provider: CanonicalDataProvider): boolean {
    if (provider.kind === "collection" && !provider.collectionProjection) return false;
    if (provider.kind === "relationship" && provider.relationship && provider.outputShape !== "scalar") {
        return false;
    }
    if (provider.valueType === "choice" || provider.valueType === "status") return false;
    if (provider.fieldType === "select" || provider.fieldType === "multiselect" || provider.fieldType === "status") {
        return false;
    }
    const caps = comparisonCapabilitiesForProvider(provider);
    return Boolean(caps.ordering);
}

export function operatorsFromComparisonCapabilities(
    caps: CanonicalComparisonCapabilities,
): WorkViewFilterOperatorV1[] {
    if (caps.dateComparison) return [...DATE_OPERATORS];
    if (caps.numericComparison && !caps.membership) {
        return ["equals", "not_equals", "is_empty", "is_not_empty"];
    }
    if (caps.membership && caps.equality) return [...SELECT_OPERATORS];
    if (caps.equality && !caps.membership) return [...BOOLEAN_OPERATORS];
    if (caps.contains) return [...TEXT_OPERATORS];
    if (caps.equality) return ["equals", "not_equals", "is_empty", "is_not_empty"];
    return ["equals"];
}

export function workViewOperatorsForProvider(provider: CanonicalDataProvider): WorkViewFilterOperatorV1[] {
    return operatorsFromComparisonCapabilities(comparisonCapabilitiesForProvider(provider));
}
