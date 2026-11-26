/**
 * Generic provider availability evaluation for collection iteration contexts.
 */

import type { CollectionIterationContext } from "@/lib/fields/collection/collectionIterationContext";
import type { ProviderContextRequirement } from "@/lib/fields/collection/providerContextRequirements";

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
        if (m.entity_type === "inquiry_child") return "Requires an inquiry or enrollment context for each child.";
        if (m.entity_type === "enrollment" && m.qualifier === "active") return "Requires an active enrollment context for each item.";
        if (m.entity_type === "opportunity") return "Requires an opportunity context for this section.";
        return `Requires ${contextEntryKey(m).replace(/_/g, " ")} context for this section.`;
    });
    return labels[0] ?? "Required context is not available in this repeatable section.";
}

export function evaluateProviderAvailabilityForIteration(input: {
    requirements: readonly ProviderContextRequirement[];
    iterationContext: CollectionIterationContext;
    consumerCapabilityBlocked?: boolean;
    consumerCapabilityMessage?: string;
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
    if (input.consumerCapabilityBlocked) {
        return {
            available: false,
            reason: "consumer_capability_mismatch",
            message: input.consumerCapabilityMessage ?? "This provider is not available for this consumer surface.",
        };
    }
    return { available: true, reason: "available" };
}
