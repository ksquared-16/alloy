/**
 * Enrollment operational grid — layout-owned column presentation (metadata + inference).
 *
 * Cell roles and edit hints come from related_list item metadata; never hardcode Lead field content here.
 */

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import { isLayoutRuntimeChildEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { isLayoutRuntimeEditableRefKeySupported } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";

/** Item metadata map: refKey → cell role for operational enrollment grid. */
export const ENROLLMENT_GRID_CELL_ROLES_METADATA_KEY = "enrollmentGridCellRoles";

export type EnrollmentGridCellRole = "primary_link" | "pill" | "compact" | "text";

const VALID_ROLES = new Set<string>(["primary_link", "pill", "compact", "text"]);

export function readEnrollmentGridCellRole(item: LayoutItem, col: LayoutCollectionColumn): EnrollmentGridCellRole {
    const roles = item.metadata?.[ENROLLMENT_GRID_CELL_ROLES_METADATA_KEY];
    if (roles && typeof roles === "object") {
        const configured = (roles as Record<string, unknown>)[col.refKey];
        if (typeof configured === "string" && VALID_ROLES.has(configured)) {
            return configured as EnrollmentGridCellRole;
        }
    }

    if (col.adornment?.action?.type === "open_drawer" && col.adornment.action.entity === "child") {
        return "primary_link";
    }
    if (col.renderHint === "status") return "pill";
    const normalized = normalizeRefKeyOnRead(col.refKey);
    if (normalized.includes("program") || normalized.includes("status") || normalized.includes("outcome")) {
        return "pill";
    }
    if (col.renderHint === "date" || normalized.includes("schedule") || normalized.includes("room") || normalized.includes("start")) {
        return "compact";
    }
    return "text";
}

/** Whether the column has a registered save adapter (layout refKey, including aliases). */
export function enrollmentGridColumnIsEditable(col: LayoutCollectionColumn): boolean {
    return isLayoutRuntimeEditableRefKeySupported(normalizeRefKeyOnRead(col.refKey))
        || isLayoutRuntimeEditableRefKeySupported(col.refKey)
        || (col.editable === true && isLayoutRuntimeChildEditableRefKey(normalizeRefKeyOnRead(col.refKey)));
}

/** Default cell roles for lead_drawer_v2 enrollment table — written to layout item metadata at seed. */
export const DEFAULT_LEAD_ENROLLMENT_GRID_CELL_ROLES: Record<string, EnrollmentGridCellRole> = {
    "child.name": "primary_link",
    "child.dob_age": "text",
    "child.program": "pill",
    "child.desired_start_date": "compact",
    "child.schedule": "compact",
    "child.room": "compact",
    "child.status": "pill",
};

/** Whether roster should stay read-only until explicit row edit (composition hint or item metadata). */
export function enrollmentRosterReadFirstActive(
    item: LayoutItem,
    compositionReadFirst?: boolean,
): boolean {
    if (item.metadata?.enrollmentRosterReadFirst === false) return false;
    if (item.metadata?.enrollmentRosterReadFirst === true) return true;
    return compositionReadFirst === true;
}
