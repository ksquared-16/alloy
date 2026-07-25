/**
 * Surface field exclusion diagnostics — why a configured / catalog field is unavailable
 * for a given Surface Builder context.
 *
 * Used by developers (and publish validation) so operators never see silent omission.
 */

import type { CanonicalDataConsumerSurface, CanonicalDataProvider } from "@/lib/fields/canonicalDataProviderModel";
import { assembleFocusPanelNestedProviders, assembleQueueRowProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { consumerSupportsProviderInPicker } from "@/lib/fields/consumerProviderCapabilities";
import { isCompactRowEffectiveFieldKey } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { AvailableFieldEntityNamespace } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type SurfaceFieldExclusionReason =
    | "wrong_subject_grain"
    | "no_read_provider"
    | "no_aggregate_provider"
    | "unsupported_presentation_depth"
    | "no_edit_adapter"
    | "permission_restriction"
    | "not_compact_effective"
    | "consumer_capability";

export type SurfaceFieldExclusionDiagnostic = {
    fieldKey: string;
    reason: SurfaceFieldExclusionReason;
    detail: string;
};

function providersForConsumer(
    consumer: CanonicalDataConsumerSurface,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): CanonicalDataProvider[] {
    if (consumer === "queue_row") {
        return assembleQueueRowProviders({ tenantFieldDefinitions });
    }
    return assembleFocusPanelNestedProviders({ tenantFieldDefinitions });
}

/**
 * Explain why `fieldKey` is not offered in a Surface Builder picker for the given namespaces.
 * Returns null when the field is available.
 */
export function diagnoseSurfaceFieldExclusion(args: {
    fieldKey: string;
    namespaces: readonly AvailableFieldEntityNamespace[];
    consumer: Extract<CanonicalDataConsumerSurface, "queue_row" | "focus_panel">;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
    requireEditAdapter?: boolean;
}): SurfaceFieldExclusionDiagnostic | null {
    const key = args.fieldKey.trim();
    if (!key) {
        return { fieldKey: key, reason: "no_read_provider", detail: "Empty field key." };
    }

    const providers = providersForConsumer(args.consumer, args.tenantFieldDefinitions);
    const provider = providers.find((p) => p.refKey === key);

    const aggregateKeys = new Set([
        "children.names",
        "children.count",
        "children.summary",
        "family.children_summary",
    ]);
    const childOnly =
        args.namespaces.length > 0
        && args.namespaces.every((ns) => ns === "child" || ns === "inquiry_child");
    if (childOnly && aggregateKeys.has(key)) {
        return {
            fieldKey: key,
            reason: "wrong_subject_grain",
            detail: "Family/queue aggregate field is not valid on a child-identity surface.",
        };
    }

    if (!provider) {
        if (
            (key.startsWith("child.") || key.startsWith("inquiry_child."))
            && args.namespaces.every((ns) => ns === "customer" || ns === "person" || ns === "opportunity")
        ) {
            return {
                fieldKey: key,
                reason: "no_aggregate_provider",
                detail: "Scalar child field has no aggregate provider for this family/opportunity surface.",
            };
        }
        return {
            fieldKey: key,
            reason: "no_read_provider",
            detail: `No canonical read provider for ${key} on ${args.consumer}.`,
        };
    }

    const accepted = new Set(args.namespaces);
    if (!accepted.has(provider.entityNamespace as AvailableFieldEntityNamespace)) {
        return {
            fieldKey: key,
            reason: "wrong_subject_grain",
            detail: `Provider namespace "${provider.entityNamespace}" is outside accepted grains [${args.namespaces.join(", ")}].`,
        };
    }

    if (!consumerSupportsProviderInPicker(args.consumer, provider)) {
        return {
            fieldKey: key,
            reason: "consumer_capability",
            detail: `Provider kind/shape is not supported in the ${args.consumer} picker.`,
        };
    }

    if (args.consumer === "queue_row" && !isCompactRowEffectiveFieldKey(key)) {
        return {
            fieldKey: key,
            reason: "not_compact_effective",
            detail: "Field is not in the CondensedQueueRow compact vocabulary (would be ineffective at runtime).",
        };
    }

    if (args.requireEditAdapter && provider.kind === "calculated_field") {
        return {
            fieldKey: key,
            reason: "no_edit_adapter",
            detail: "Calculated/computed fields are read-only — no edit adapter.",
        };
    }

    return null;
}

/** Batch diagnostics for a selected field list (publish / developer panel). */
export function diagnoseSelectedSurfaceFields(args: {
    fieldKeys: readonly string[];
    namespaces: readonly AvailableFieldEntityNamespace[];
    consumer: Extract<CanonicalDataConsumerSurface, "queue_row" | "focus_panel">;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): SurfaceFieldExclusionDiagnostic[] {
    const out: SurfaceFieldExclusionDiagnostic[] = [];
    for (const fieldKey of args.fieldKeys) {
        const hit = diagnoseSurfaceFieldExclusion({ ...args, fieldKey });
        if (hit) out.push(hit);
    }
    return out;
}
