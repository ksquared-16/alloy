/**
 * Canonical field surface availability — Settings → Fields and consumer guardrails.
 *
 * Delegates to fieldCapabilityEngine (derived from resolver registry).
 * Legacy badge exports preserved for FieldsGroupedEntityPanel closeout components.
 *
 * @see docs/sprints/archive/07_2026/field-runtime-unification.md
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
} from "@/lib/fields/customerMemberFieldRegistry";
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

/** Legacy five-surface badge model used by configuration-runtime Fields cards. */
export type FieldSurfaceKey = "forms" | "drawers" | "tables" | "queue_rows" | "focus_panel";

export type FieldSurfaceAvailabilityBadge = {
    surface: FieldSurfaceKey;
    label: string;
    status: FieldSurfaceAvailabilityStatus;
    reason?: string;
};

export const FIELD_SURFACE_LABELS: Record<FieldSurfaceKey, string> = {
    forms: "Forms",
    drawers: "Drawers",
    tables: "Tables",
    queue_rows: "Queue Rows",
    focus_panel: "Focus Panel",
};

const LEGACY_SURFACE_ORDER: readonly FieldSurfaceKey[] = [
    "forms",
    "drawers",
    "tables",
    "queue_rows",
    "focus_panel",
];

const CONSUMER_TO_LEGACY_SURFACE: Partial<Record<FieldConsumerSurface, FieldSurfaceKey>> = {
    forms: "forms",
    drawer: "drawers",
    table: "tables",
    queue_row: "queue_rows",
    focus_panel: "focus_panel",
};

type LegacyFieldSurfaceInput = Pick<
    FieldDef,
    "field_key" | "is_visible_in_form" | "is_visible_in_drawer" | "is_visible_in_table"
> &
    Partial<Pick<FieldDef, "field_type" | "label" | "is_system" | "is_active" | "config">>;

function registryInputFromFieldDef(
    entityType: string,
    row: LegacyFieldSurfaceInput,
): FieldRegistryAvailabilityInput {
    return {
        entity_type: entityType,
        field_key: row.field_key,
        field_type: row.field_type,
        label: row.label,
        is_system: row.is_system,
        is_active: row.is_active,
        is_visible_in_form: row.is_visible_in_form,
        is_visible_in_drawer: row.is_visible_in_drawer,
        is_visible_in_table: row.is_visible_in_table,
        config: row.config,
    };
}

function legacyBadgesFromRegistryInput(input: FieldRegistryAvailabilityInput): FieldSurfaceAvailabilityBadge[] {
    const rows = deriveRegistryFieldAvailability(input);
    const byLegacy = new Map<FieldSurfaceKey, FieldSurfaceAvailabilityBadge>();
    for (const row of rows) {
        const legacySurface = CONSUMER_TO_LEGACY_SURFACE[row.surface];
        if (!legacySurface) continue;
        byLegacy.set(legacySurface, {
            surface: legacySurface,
            label: FIELD_SURFACE_LABELS[legacySurface],
            status: row.status,
            reason: row.reason || undefined,
        });
    }
    return LEGACY_SURFACE_ORDER.map(
        (surface) =>
            byLegacy.get(surface) ?? {
                surface,
                label: FIELD_SURFACE_LABELS[surface],
                status: "unavailable" as const,
            },
    );
}

/** Resolve surface availability for a field_definitions row (Settings → Fields). */
export function resolveFieldSurfaceAvailability(
    input: FieldRegistryAvailabilityInput,
): FieldSurfaceAvailabilityRow[];
export function resolveFieldSurfaceAvailability(
    entityType: string,
    row: LegacyFieldSurfaceInput,
): FieldSurfaceAvailabilityBadge[];
export function resolveFieldSurfaceAvailability(
    entityTypeOrInput: string | FieldRegistryAvailabilityInput,
    row?: LegacyFieldSurfaceInput,
): FieldSurfaceAvailabilityRow[] | FieldSurfaceAvailabilityBadge[] {
    if (typeof entityTypeOrInput === "object") {
        return deriveRegistryFieldAvailability(entityTypeOrInput);
    }
    return legacyBadgesFromRegistryInput(registryInputFromFieldDef(entityTypeOrInput, row!));
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

/** Map field_definitions row → layout refKey used by queue row / layout pickers. */
export function layoutRefKeyForFieldDefinition(entityType: string, fieldKey: string): string | null {
    const et = entityType.trim().toLowerCase();
    const fk = fieldKey.trim();
    if (!fk) return null;

    if (et === "customer_member") {
        if ((CUSTOMER_MEMBER_CONFIG_FIELD_KEYS as readonly string[]).includes(fk)) {
            return `child.${fk}`;
        }
        return null;
    }
    if (et === "job") return `opportunity.${fk}`;
    if (et === "person" || et === "customer" || et === "opportunity" || et === "inquiry_child") {
        return `${et}.${fk}`;
    }
    return null;
}

/** Synthetic FieldDef-shaped rows for customer_member child profile fields shown under Child entity. */
export function syntheticChildProfileFieldRows(): Array<
    Pick<FieldDef, "field_key" | "label" | "is_visible_in_form" | "is_visible_in_drawer" | "is_visible_in_table"> & {
        entity_type: "customer_member";
        description?: string | null;
    }
> {
    return CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((manifest) => ({
        entity_type: "customer_member" as const,
        field_key: manifest.field_key,
        label: manifest.label,
        description: null,
        is_visible_in_form: true,
        is_visible_in_drawer: true,
        is_visible_in_table: false,
    }));
}

export function isGenderFieldDefinition(entityType: string, fieldKey: string): boolean {
    const et = entityType.trim().toLowerCase();
    const fk = fieldKey.trim().toLowerCase();
    return (et === "customer_member" || et === "inquiry_child") && fk === "gender";
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
