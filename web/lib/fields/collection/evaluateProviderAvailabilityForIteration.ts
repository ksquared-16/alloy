/**
 * Generic provider availability evaluation for collection iteration contexts.
 *
 * Shared by authoring picker, publish validation, submission validation, and runtime prefill.
 */

import type { FormField } from "@/lib/forms/schema";
import type { CanonicalDataConsumerSurface } from "@/lib/fields/canonicalDataProviderModel";
import type { CollectionIterationContext } from "@/lib/fields/collection/collectionIterationContext";
import {
    providerContextRequirementsForFormField,
    type ProviderContextRequirement,
} from "@/lib/fields/collection/providerContextRequirements";
import { evaluateFormsProviderEligibility } from "@/lib/fields/formsProviderEligibility";
import { canonicalRefKey } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { canonicalRefFromFormField } from "@/lib/fields/collection/providerContextRequirements";

export type ProviderAvailabilityReason =
    | "available"
    | "missing_required_context"
    | "wrong_item_entity"
    | "unsupported_provider_kind"
    | "unsupported_output_shape"
    | "missing_resolver"
    | "read_only_not_supported"
    | "consumer_capability_mismatch"
    | "unmapped_binding";

export type ProviderAvailabilityResult = {
    available: boolean;
    reason: ProviderAvailabilityReason;
    missing_contexts?: string[];
    message?: string;
};

function contextEntryKey(entry: { entity_type: string; qualifier?: string }): string {
    const entity = entry.entity_type.trim().toLowerCase();
    const qualifier = entry.qualifier?.trim();
    return qualifier ? `${entity}:${qualifier}` : entity;
}

function contextRequirementSatisfied(
    available: CollectionIterationContext["available_contexts"],
    requirement: ProviderContextRequirement,
): boolean {
    const entity = requirement.entity_type.trim().toLowerCase();
    const qualifier = requirement.qualifier?.trim();

    return available.some((entry) => {
        if (entry.entity_type.trim().toLowerCase() !== entity) return false;
        if (qualifier) return (entry.qualifier?.trim() ?? "") === qualifier;
        return true;
    });
}

function formatMissingContextMessage(missing: ProviderContextRequirement[]): string {
    const labels = missing.map((m) => {
        if (m.entity_type === "inquiry_child") {
            return "Requires an inquiry or enrollment context for each child.";
        }
        if (m.entity_type === "enrollment" && m.qualifier === "active") {
            return "Requires an active enrollment context for each item.";
        }
        if (m.entity_type === "opportunity") {
            return "Requires an opportunity context for this section.";
        }
        const key = contextEntryKey(m);
        return `Requires ${key.replace(/_/g, " ")} context for this section.`;
    });
    return labels[0] ?? "Required context is not available in this repeatable section.";
}

/** Evaluate whether provider context requirements are satisfied by iteration context. */
export function evaluateProviderAvailabilityForIteration(input: {
    requirements: readonly ProviderContextRequirement[];
    iterationContext: CollectionIterationContext;
    consumer?: CanonicalDataConsumerSurface;
    providerRefKey?: string;
}): ProviderAvailabilityResult {
    const missing = input.requirements.filter(
        (req) => req.required && !contextRequirementSatisfied(input.iterationContext.available_contexts, req),
    );

    if (missing.length > 0) {
        return {
            available: false,
            reason: "missing_required_context",
            missing_contexts: missing.map(contextEntryKey),
            message: formatMissingContextMessage(missing),
        };
    }

    if (input.providerRefKey && input.consumer) {
        const eligibility = evaluateFormsProviderEligibility(input.providerRefKey);
        const knownProvider = !eligibility.reasons.includes("unknown_provider");
        if (knownProvider && !eligibility.picker && input.consumer === "forms") {
            return {
                available: false,
                reason: "consumer_capability_mismatch",
                message: "This provider is not available for Forms / Documents in the current release.",
            };
        }
    }

    return { available: true, reason: "available" };
}

/** Evaluate a nested form field against a collection iteration context. */
export function evaluateFormFieldAvailabilityForIteration(
    field: FormField,
    iterationContext: CollectionIterationContext,
    options?: { consumer?: CanonicalDataConsumerSurface },
): ProviderAvailabilityResult {
    if (field.type === "group") {
        return {
            available: false,
            reason: "unsupported_output_shape",
            message: "Nested groups inside collection repeaters are not supported.",
        };
    }

    const requirements = providerContextRequirementsForFormField(field);
    if (requirements.length === 0) {
        return {
            available: false,
            reason: "unmapped_binding",
            message: "Custom or unmapped fields require an explicit binding before publish.",
        };
    }

    const ref = canonicalRefFromFormField(field);
    const providerRefKey = ref ? canonicalRefKey(ref) : undefined;

    return evaluateProviderAvailabilityForIteration({
        requirements,
        iterationContext,
        consumer: options?.consumer ?? "forms",
        providerRefKey,
    });
}

/** Boolean convenience for legacy call sites — prefer structured evaluator. */
export function isFormFieldAvailableForIteration(
    field: FormField,
    iterationContext: CollectionIterationContext,
): boolean {
    return evaluateFormFieldAvailabilityForIteration(field, iterationContext).available;
}
