/**
 * Dev/proof harness helpers for layout-runtime person + child drawer links.
 */

import type { LayoutCollectionColumn, LayoutFieldAdornment } from "@/lib/layout/layoutV2";
import { resolveLayoutRuntimeChildOpenTarget } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const LAYOUT_RUNTIME_DEFAULT_CHILD_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "child",
    action: { type: "open_drawer", entity: "child", idPath: "child.id" },
};

export const LAYOUT_RUNTIME_DEFAULT_PERSON_LINK: LayoutFieldAdornment = {
    position: "left",
    icon: "person",
    action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" },
};

const CHILD_NAME_REF_KEYS = /^child\.(name|display_name|first_name|full_name)$/i;

export function isLayoutRuntimeChildNameRefKey(refKey: string | undefined): boolean {
    if (!refKey?.trim()) return false;
    return CHILD_NAME_REF_KEYS.test(refKey.trim());
}

export function isLayoutRuntimeChildLinkColumn(
    refKey: string | undefined,
    _entityType?: string | null,
): boolean {
    return isLayoutRuntimeChildNameRefKey(refKey);
}

/** Ensure child rows always carry an open_drawer action (inferred columns often omit it). */
export function ensureLayoutRuntimeChildLinkAdornment(
    adornment: LayoutFieldAdornment | null | undefined,
    refKey?: string,
): LayoutFieldAdornment {
    if (adornment?.action?.type === "open_drawer" && adornment.action.entity === "child") {
        return adornment;
    }
    const base = adornment ?? LAYOUT_RUNTIME_DEFAULT_CHILD_LINK;
    return {
        position: base.position ?? "left",
        icon: base.icon ?? "child",
        action: LAYOUT_RUNTIME_DEFAULT_CHILD_LINK.action,
    };
}

export function ensureLayoutRuntimePersonLinkAdornment(
    adornment: LayoutFieldAdornment | null | undefined,
    idPath?: string,
): LayoutFieldAdornment {
    if (adornment?.action?.type === "open_drawer" && adornment.action.entity === "person") {
        return adornment;
    }
    const base = adornment ?? LAYOUT_RUNTIME_DEFAULT_PERSON_LINK;
    return {
        position: base.position ?? "left",
        icon: base.icon ?? "person",
        action: {
            type: "open_drawer",
            entity: "person",
            idPath: idPath ?? LAYOUT_RUNTIME_DEFAULT_PERSON_LINK.action!.idPath,
        },
    };
}

export function layoutRuntimeChildLinkDomDataset(
    row: ProofRuntimeRecord | null | undefined,
    surface: "queue" | "drawer",
    anchorRecord?: ProofRuntimeRecord,
): Record<string, string> {
    const openTarget = row
        ? resolveLayoutRuntimeChildOpenTarget(row, { anchorRecord, idPath: "child.id" })
        : null;
    return {
        "data-layout-runtime-child-link": "true",
        "data-link-surface": surface === "drawer" ? "drawer" : "queue",
        "data-child-target-person-id": openTarget?.personId ?? "",
        "data-child-target-customer-member-id": openTarget?.customerMemberId ?? "",
        "data-child-target-ocm-id": openTarget?.ocmId ?? "",
    };
}

export function layoutRuntimePersonLinkDomDataset(
    personId: string | null | undefined,
    surface: "queue" | "drawer",
): Record<string, string> {
    return {
        "data-layout-runtime-person-link": "true",
        "data-link-surface": surface === "drawer" ? "drawer" : "queue",
        "data-person-target-id": personId?.trim() ?? "",
    };
}

/** Add child-link adornment to inferred repeater name columns. */
export function enrichInferredChildRepeaterColumns(
    columns: LayoutCollectionColumn[],
): LayoutCollectionColumn[] {
    if (columns.length === 0) return columns;
    return columns.map((col, index) => {
        const isNameCol = isLayoutRuntimeChildNameRefKey(col.refKey) || index === 0;
        if (!isNameCol || col.adornment?.action?.entity === "child") return col;
        return {
            ...col,
            adornment: ensureLayoutRuntimeChildLinkAdornment(col.adornment, col.refKey),
        };
    });
}
