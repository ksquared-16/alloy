/**
 * Nested field eligibility for collection-bound repeatable groups.
 *
 * Uses canonical context-aware provider availability — not consumer field allow/deny lists.
 */

import type { FormField, FormGroupCollectionBinding } from "@/lib/forms/schema";
import type { SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";
import {
    type CollectionIterationContext,
} from "@/lib/fields/collection/collectionIterationContext";
import { iterationContextFromCollectionBinding } from "@/lib/forms/collection/formsCollectionIterationContext";
import {
    evaluateFormFieldAvailabilityForIteration,
    type ProviderAvailabilityResult,
} from "@/lib/forms/collection/formsProviderAvailability";
import { evaluateFormsProviderEligibility } from "@/lib/fields/formsProviderEligibility";
import { canonicalRefFromFormField } from "@/lib/forms/collection/formsProviderContextRequirements";
import { canonicalRefKey } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";

export type NestedFieldCompatibility =
    | { status: "compatible" }
    | { status: "incompatible"; reason: string; availability?: ProviderAvailabilityResult }
    | { status: "legacy_retained"; reason: string; availability?: ProviderAvailabilityResult };

function registryEntryToProbe(entry: SystemFieldRegistryEntry): FormField {
    return formFieldFromRegistryEntry(entry, {});
}

/** Filter system field picker rows by canonical context availability. */
export function filterSystemFieldsForCollectionIteration(
    fields: readonly SystemFieldRegistryEntry[],
    iterationContext: CollectionIterationContext,
): SystemFieldRegistryEntry[] {
    return fields.filter((entry) => {
        const probe = registryEntryToProbe(entry);
        return evaluateFormFieldAvailabilityForIteration(probe, iterationContext).available;
    });
}

/** Availability rows for picker — includes unavailable entries with semantic explanations. */
export function systemFieldAvailabilityForCollectionIteration(
    fields: readonly SystemFieldRegistryEntry[],
    iterationContext: CollectionIterationContext,
): Array<{ entry: SystemFieldRegistryEntry; availability: ProviderAvailabilityResult }> {
    return fields.map((entry) => ({
        entry,
        availability: evaluateFormFieldAvailabilityForIteration(registryEntryToProbe(entry), iterationContext),
    }));
}

/** Assess whether an existing nested field remains compatible with iteration context. */
export function nestedFieldCompatibilityForIteration(
    field: FormField,
    iterationContext: CollectionIterationContext,
): NestedFieldCompatibility {
    const availability = evaluateFormFieldAvailabilityForIteration(field, iterationContext);

    if (field.type === "group") {
        return {
            status: "incompatible",
            reason: availability.message ?? "Nested groups inside collection repeaters are not supported.",
            availability,
        };
    }

    if (!field.field_source || field.field_source.entity_type === "custom") {
        return {
            status: "legacy_retained",
            reason: "Custom unmapped field — publish may require binding.",
            availability,
        };
    }

    if (availability.available) {
        return { status: "compatible" };
    }

    if (availability.reason === "missing_required_context") {
        return {
            status: "legacy_retained",
            reason: availability.message ?? "Required context is not available in this repeatable section.",
            availability,
        };
    }

    const ref = canonicalRefFromFormField(field);
    if (ref) {
        const eligibility = evaluateFormsProviderEligibility(canonicalRefKey(ref));
        if (!eligibility.picker) {
            return {
                status: "legacy_retained",
                reason: "Provider not eligible for new picker selection.",
                availability,
            };
        }
    }

    return {
        status: "legacy_retained",
        reason: availability.message ?? "Field is not compatible with this collection iteration context.",
        availability,
    };
}

/** When switching collection provider, partition nested fields into keep vs incompatible. */
export function partitionNestedFieldsForProviderSwitch(
    nestedFields: FormField[],
    nextBinding: FormGroupCollectionBinding,
): { keep: FormField[]; incompatible: FormField[] } {
    const nextContext = iterationContextFromCollectionBinding(nextBinding);
    const keep: FormField[] = [];
    const incompatible: FormField[] = [];
    for (const f of nestedFields) {
        const compat = nestedFieldCompatibilityForIteration(f, nextContext);
        if (compat.status === "compatible") keep.push(f);
        else incompatible.push(f);
    }
    return { keep, incompatible };
}
