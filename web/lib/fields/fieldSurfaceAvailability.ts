/**
 * Canonical field surface availability — Settings → Fields and consumer guardrails.
 *
 * Delegates to fieldCapabilityEngine (derived from resolver registry).
 * Legacy exports preserved for existing consumers.
 *
 * @see docs/sprints/07_2026/field-runtime-unification.md
 */

import { layoutRefKeyToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import {
    deriveRegistryFieldAvailability,
    derivePlatformFieldAvailability,
    deriveComputedFieldAvailability,
} from "@/lib/fields/fieldCapabilityEngine";
import {
    canSurfaceResolveField,
    supportedSurfacesForField,
    type FieldResolverInput,
    resolverInputFromComputedField,
} from "@/lib/fields/fieldResolverRegistry";
import { applyChildcareCatalogLabel } from "@/lib/layout/childcareLayoutFieldCatalog";
import { isValidatorAllowedQueueRecordFieldRefKey } from "@/lib/layout/queueRecordValidatorAllowList";
import type { PlatformFieldDefinition } from "@/lib/fields/platformFieldCatalog";
import type { ComputedFieldDefinition } from "@/lib/fields/computedFieldCatalog";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

export type FieldConsumerSurface =
    | "forms"
    | "drawer"
    | "table"
    | "queue_row"
    | "focus_panel"
    | "business_process"
    | "documents";

export type FieldSurfaceAvailabilityStatus = "available" | "unavailable";

export type FieldSurfaceAvailabilityRow = {
    surface: FieldConsumerSurface;
    status: FieldSurfaceAvailabilityStatus;
    reason: string;
};

export type FieldRegistryAvailabilityInput = {
    entity_type: string;
    field_key: string;
    field_type?: string;
    label?: string | null;
    is_system?: boolean;
    is_active?: boolean;
    is_visible_in_form?: boolean;
    is_visible_in_drawer?: boolean;
    is_visible_in_table?: boolean;
    config?: Record<string, unknown> | null;
};

export const FIELD_CONSUMER_SURFACE_LABELS: Readonly<Record<FieldConsumerSurface, string>> = {
    forms: "Forms",
    drawer: "Drawers",
    table: "Tables",
    queue_row: "Queue rows",
    focus_panel: "Focus panel",
    business_process: "Business processes",
    documents: "Documents",
};

/** Resolve surface availability for a field_definitions row (Settings → Fields). */
export function resolveFieldSurfaceAvailability(input: FieldRegistryAvailabilityInput): FieldSurfaceAvailabilityRow[] {
    return deriveRegistryFieldAvailability(input);
}

/** Resolve surface availability for a platform native field. */
export function resolvePlatformFieldSurfaceAvailability(row: PlatformFieldDefinition): FieldSurfaceAvailabilityRow[] {
    return derivePlatformFieldAvailability(row);
}

/** Resolve surface availability for a computed catalog field. */
export function resolveComputedFieldSurfaceAvailability(row: ComputedFieldDefinition): FieldSurfaceAvailabilityRow[] {
    return deriveComputedFieldAvailability(row);
}

/** Resolve surface availability for a unified Settings catalog entry. */
export function resolveSettingsCatalogEntryAvailability(input: {
    ownership: "platform" | "custom" | "computed";
    platformField?: PlatformFieldDefinition;
    computedField?: ComputedFieldDefinition;
    registry?: FieldRegistryAvailabilityInput;
    hub_entity?: SettingsHubEntityKey;
}): FieldSurfaceAvailabilityRow[] {
    const options = input.hub_entity ? { hub_entity: input.hub_entity } : undefined;
    if (input.ownership === "computed" && input.computedField) {
        return deriveComputedFieldAvailability(input.computedField, options);
    }
    if (input.ownership === "platform" && input.platformField) {
        return derivePlatformFieldAvailability(input.platformField, options);
    }
    if (input.registry) {
        return deriveRegistryFieldAvailability(input.registry, options);
    }
    return [];
}

export function availableSurfacesForField(input: FieldRegistryAvailabilityInput): FieldConsumerSurface[] {
    return resolveFieldSurfaceAvailability(input)
        .filter((r) => r.status === "available")
        .map((r) => r.surface);
}

export function unavailableSurfacesForField(input: FieldRegistryAvailabilityInput): FieldSurfaceAvailabilityRow[] {
    return resolveFieldSurfaceAvailability(input).filter((r) => r.status === "unavailable");
}

export function operatorLayoutRefKeyLabel(refKey: string): string {
    const labeled = applyChildcareCatalogLabel({ refKey, fieldLabel: refKey });
    return labeled.fieldLabel;
}

export function registryRefFromLayoutRefKey(refKey: string): { entity_type: string; field_key: string } | null {
    return layoutRefKeyToCanonicalRef(refKey);
}

export function isQueueCompositionFieldResolverBacked(refKey: string, isWaitlist = false): boolean {
    return isValidatorAllowedQueueRecordFieldRefKey(refKey.trim(), isWaitlist);
}

export function filterResolverBackedCompositionFieldKeys(
    keys: readonly string[],
    isWaitlist = false,
): string[] {
    return keys.filter((k) => isQueueCompositionFieldResolverBacked(k, isWaitlist));
}

/** Re-export resolver input helpers for tests and builders. */
export function resolverInputFromRegistryRow(input: FieldRegistryAvailabilityInput): FieldResolverInput {
    return {
        entity_type: input.entity_type,
        field_key: input.field_key,
        field_type: input.field_type,
        label: input.label,
        is_system: input.is_system,
        is_active: input.is_active,
        is_visible_in_form: input.is_visible_in_form,
        is_visible_in_drawer: input.is_visible_in_drawer,
        is_visible_in_table: input.is_visible_in_table,
        config: input.config,
        is_platform_native: false,
    };
}

export { canSurfaceResolveField, supportedSurfacesForField, resolverInputFromComputedField };
