/**
 * Operator-facing surface availability for Fields settings.
 *
 * Source-of-truth doctrine:
 * - Child fields are operator-facing; runtime hydrates from customer_member / inquiry child / person sources.
 * - Queue Rows expose child fields only when resolver-backed (see collectionFieldPresentation catalog).
 * - Fields registry visibility ≠ automatic surface availability.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
} from "@/lib/fields/customerMemberFieldRegistry";
import { isQueueRowChildProfileFieldResolverBacked } from "@/lib/layout/runtime/queueRowChildProfileFieldRegistry";
import { COMPACT_ROW_EFFECTIVE_FIELD_KEYS } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { collectionItemFieldIsAvailable } from "@/lib/presentation/collectionFieldPresentation";

export type FieldSurfaceKey = "forms" | "drawers" | "tables" | "queue_rows" | "focus_panel";

export type FieldSurfaceAvailabilityStatus = "available" | "unavailable";

export type FieldSurfaceAvailabilityBadge = {
    surface: FieldSurfaceKey;
    label: string;
    status: FieldSurfaceAvailabilityStatus;
    /** Plain-language tooltip when unavailable or nuance is needed. */
    reason?: string;
};

export const FIELD_SURFACE_LABELS: Record<FieldSurfaceKey, string> = {
    forms: "Forms",
    drawers: "Drawers",
    tables: "Tables",
    queue_rows: "Queue Rows",
    focus_panel: "Focus Panel",
};

export {
    FIELDS_CUSTOM_FIELD_SURFACE_NOTE,
    FIELDS_SURFACE_AVAILABILITY_INTRO,
} from "@/lib/fields/fieldSettingsOperatorUi";

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

function queueRowAvailabilityForRefKey(layoutRefKey: string | null): Pick<FieldSurfaceAvailabilityBadge, "status" | "reason"> {
    if (!layoutRefKey) {
        return {
            status: "unavailable",
            reason: "No queue row resolver is registered for this field yet.",
        };
    }

    if (layoutRefKey === "child.gender") {
        if (collectionItemFieldIsAvailable("gender")) {
            return {
                status: "available",
                reason: "Renders inside the Children collection when configured on a queue row.",
            };
        }
        return {
            status: "unavailable",
            reason: "Gender exists as a child profile field, but queue row runtime does not hydrate it yet.",
        };
    }

    if (COMPACT_ROW_EFFECTIVE_FIELD_KEYS.has(layoutRefKey)) {
        return { status: "available" };
    }

    if (isQueueRowChildProfileFieldResolverBacked(layoutRefKey)) {
        return { status: "available" };
    }

    return {
        status: "unavailable",
        reason: "Not configured for compact queue row rendering yet.",
    };
}

function focusPanelAvailability(entityType: string, row: Pick<FieldDef, "is_visible_in_drawer">): Pick<FieldSurfaceAvailabilityBadge, "status" | "reason"> {
    const et = entityType.trim().toLowerCase();
    if (et === "inquiry_child" || et === "customer_member") {
        return row.is_visible_in_drawer
            ? { status: "available", reason: "Available when placed on a Focus Panel Children card." }
            : {
                  status: "unavailable",
                  reason: "Enable drawer visibility, then add the field on a Focus Panel surface.",
              };
    }
    if (et === "person" || et === "customer" || et === "opportunity") {
        return row.is_visible_in_drawer
            ? { status: "available", reason: "Available when placed on a matching Focus Panel card." }
            : {
                  status: "unavailable",
                  reason: "Enable drawer visibility, then add the field on a Focus Panel surface.",
              };
    }
    return {
        status: "unavailable",
        reason: "Focus Panel placement is configured per surface in Settings → Surfaces.",
    };
}

export function resolveFieldSurfaceAvailability(
    entityType: string,
    row: Pick<
        FieldDef,
        "field_key" | "is_visible_in_form" | "is_visible_in_drawer" | "is_visible_in_table"
    >,
): FieldSurfaceAvailabilityBadge[] {
    const layoutRefKey = layoutRefKeyForFieldDefinition(entityType, row.field_key);
    const queueRow = queueRowAvailabilityForRefKey(layoutRefKey);
    const focusPanel = focusPanelAvailability(entityType, row);

    return [
        {
            surface: "forms",
            label: FIELD_SURFACE_LABELS.forms,
            status: row.is_visible_in_form ? "available" : "unavailable",
            reason: row.is_visible_in_form
                ? undefined
                : "Hidden from Forms — enable “Visible in form” when editing this field.",
        },
        {
            surface: "drawers",
            label: FIELD_SURFACE_LABELS.drawers,
            status: row.is_visible_in_drawer ? "available" : "unavailable",
            reason: row.is_visible_in_drawer
                ? undefined
                : "Hidden from record drawers — enable “Visible in drawer” when editing this field.",
        },
        {
            surface: "tables",
            label: FIELD_SURFACE_LABELS.tables,
            status: row.is_visible_in_table ? "available" : "unavailable",
            reason: row.is_visible_in_table
                ? undefined
                : "Hidden from list/table views — enable “Visible in table” when editing this field.",
        },
        {
            surface: "queue_rows",
            label: FIELD_SURFACE_LABELS.queue_rows,
            ...queueRow,
        },
        {
            surface: "focus_panel",
            label: FIELD_SURFACE_LABELS.focus_panel,
            ...focusPanel,
        },
    ];
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
