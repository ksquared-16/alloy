/**
 * Generic layout-runtime field editability gate.
 */

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import { isLayoutRuntimeChildEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { isLayoutRuntimeOpportunityNativeRefKey } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { isLayoutRuntimePersonFieldRefKey } from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutRuntimeSurfaceVariant = "proof" | "production" | "preview";

export const LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_DISPLAY_REF = "opportunity.location";
export const LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_EDIT_REF = "opportunity.location_id";

/** Map display-only refKeys to editable storage refKeys (includes alias-on-read). */
export function resolveLayoutRuntimeEditableRefKey(refKey: string): string {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    if (normalized === LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_DISPLAY_REF) {
        return LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_EDIT_REF;
    }
    return normalized;
}

/** Whether a layout refKey has a supported runtime save adapter (ignores builder editable flag). */
export function isLayoutRuntimeEditableRefKeySupported(refKey: string): boolean {
    const resolved = resolveLayoutRuntimeEditableRefKey(refKey);
    if (isLayoutRuntimePersonFieldRefKey(resolved)) return true;
    if (isLayoutRuntimeOpportunityNativeRefKey(resolved)) return true;
    return isLayoutRuntimeChildEditableRefKey(resolved);
}

/** Stored value for editable controls — select fields need ids, not display labels. */
export function resolveLayoutRuntimeEditableFieldFallback(
    record: ProofRuntimeRecord,
    editableRefKey: string,
    displayFallback: string,
): string {
    const draftLike = record[editableRefKey];
    if (draftLike != null && String(draftLike).trim()) {
        const text = String(draftLike).trim();
        const control = resolveLayoutRuntimeFieldControl(editableRefKey);
        if (control.controlType === "select") return text;
    }

    if (editableRefKey === LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_EDIT_REF) {
        const stored =
            String(
                record[LAYOUT_RUNTIME_OPPORTUNITY_LOCATION_EDIT_REF]
                ?? record.location_id
                ?? record._location_id
                ?? "",
            ).trim();
        if (stored && isUuidLike(stored)) return stored;
        return "";
    }

    const control = resolveLayoutRuntimeFieldControl(editableRefKey);
    if (control.controlType === "select") {
        const stored = record[editableRefKey];
        if (stored != null && String(stored).trim()) return String(stored).trim();
    }

    return displayFallback;
}

/** Whether one layout item should render an input in production runtime. */
export function layoutRuntimeFieldIsEditable(
    item: Pick<LayoutItem, "editable" | "refKey">,
    variant: LayoutRuntimeSurfaceVariant,
): boolean {
    if (variant !== "production") return false;
    if (item.editable !== true) return false;
    const refKey = item.refKey?.trim() ?? "";
    if (!refKey) return false;
    return isLayoutRuntimeEditableRefKeySupported(refKey);
}

/** Whether a related-list column is configured inline-editable with a supported save adapter. */
export function layoutRuntimeCollectionColumnIsInlineEditable(
    col: Pick<LayoutCollectionColumn, "editable" | "refKey">,
    variant: LayoutRuntimeSurfaceVariant,
): boolean {
    if (col.editable !== true) return false;
    return layoutRuntimeFieldIsEditable({ editable: true, refKey: col.refKey }, variant);
}
