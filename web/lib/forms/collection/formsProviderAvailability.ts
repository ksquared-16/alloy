/**
 * Forms adapter - evaluate nested field availability inside collection repeaters.
 */

import type { FormField } from "@/lib/forms/schema";
import type { CollectionIterationContext } from "@/lib/fields/collection/collectionIterationContext";
import {
    evaluateProviderAvailabilityForIteration,
    type ProviderAvailabilityResult,
} from "@/lib/fields/collection/evaluateProviderAvailabilityForIteration";
import { canonicalRefFromFormField, providerContextRequirementsForFormField } from "@/lib/forms/collection/formsProviderContextRequirements";
import { evaluateFormsProviderEligibility } from "@/lib/fields/formsProviderEligibility";
import { canonicalRefKey } from "@/lib/fields/fieldRegistryReferenceMatrix";

export function evaluateFormFieldAvailabilityForIteration(
    field: FormField,
    iterationContext: CollectionIterationContext,
): ProviderAvailabilityResult {
    if (field.type === "group") {
        return { available: false, reason: "unsupported_output_shape", message: "Nested groups inside collection repeaters are not supported." };
    }
    const requirements = providerContextRequirementsForFormField(field);
    if (requirements.length === 0) {
        return { available: false, reason: "unmapped_binding", message: "Custom or unmapped fields require an explicit binding before publish." };
    }
    const ref = canonicalRefFromFormField(field);
    const providerRefKey = ref ? canonicalRefKey(ref) : undefined;
    let consumerCapabilityBlocked = false;
    if (providerRefKey) {
        const eligibility = evaluateFormsProviderEligibility(providerRefKey);
        const knownProvider = !eligibility.reasons.includes("unknown_provider");
        consumerCapabilityBlocked = knownProvider && !eligibility.picker;
    }
    return evaluateProviderAvailabilityForIteration({
        requirements,
        iterationContext,
        consumerCapabilityBlocked,
        consumerCapabilityMessage: "This provider is not available for Forms / Documents in the current release.",
    });
}

export function isFormFieldAvailableForIteration(field: FormField, iterationContext: CollectionIterationContext): boolean {
    return evaluateFormFieldAvailabilityForIteration(field, iterationContext).available;
}

export type { ProviderAvailabilityResult } from "@/lib/fields/collection/evaluateProviderAvailabilityForIteration";
