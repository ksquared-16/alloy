/**
 * Resolve linked-record ids for layout adornment open_drawer actions.
 */

import { inferLayoutAdornmentIdPath } from "@/lib/layout/inferLayoutAdornmentIdPath";
import type { LayoutAdornmentActionEntity } from "@/lib/layout/layoutV2";
import type { LayoutFieldAdornment } from "@/lib/layout/layoutV2";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { resolveLayoutRuntimeIdPath } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import { resolveLayoutRuntimeChildPersonId } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Resolve person id from anchor and/or row records. */
export function resolveLayoutRuntimePersonIdForOpen(
    anchorRecord: ProofRuntimeRecord,
    rowRecord?: ProofRuntimeRecord,
    idPath?: string,
    refKey?: string,
): string | null {
    const source = rowRecord ?? anchorRecord;
    const paths = [
        idPath,
        idPath ? undefined : inferLayoutAdornmentIdPath("person", refKey),
        "person.id",
        "person.primary_contact_id",
        "opportunity.primary_person_id",
        "_primary_person_id",
        "primary_person_id",
    ].filter((p): p is string => Boolean(p?.trim()));

    for (const path of paths) {
        const fromSource = resolveLayoutRuntimeIdPath(source, path);
        if (fromSource) return fromSource;
        if (source !== anchorRecord) {
            const fromAnchor = resolveLayoutRuntimeIdPath(anchorRecord, path);
            if (fromAnchor) return fromAnchor;
        }
    }

    const relationPersonId = trimId(
        (anchorRecord._relations as { primary_contact?: { entityId?: unknown } } | undefined)?.primary_contact?.entityId,
    );
    if (relationPersonId) return relationPersonId;

    return primaryPersonIdFromOpportunityRecord(anchorRecord as Record<string, unknown>);
}

/** Resolve target entity id for one adornment action. */
export function resolveLayoutRuntimeLinkedEntityId(
    action: NonNullable<LayoutFieldAdornment["action"]>,
    params: {
        anchorRecord: ProofRuntimeRecord;
        rowRecord?: ProofRuntimeRecord;
        refKey?: string;
    },
): string | null {
    if (action.entity === "child") {
        const source = params.rowRecord ?? params.anchorRecord;
        return resolveLayoutRuntimeChildPersonId(source, action.idPath, params.refKey, params.anchorRecord);
    }
    if (action.entity === "person") {
        return resolveLayoutRuntimePersonIdForOpen(
            params.anchorRecord,
            params.rowRecord,
            action.idPath,
            params.refKey,
        );
    }
    if (action.entity === "opportunity") {
        return (
            resolveLayoutRuntimeIdPath(params.rowRecord ?? params.anchorRecord, action.idPath) ??
            resolveLayoutRuntimeIdPath(params.anchorRecord, action.idPath ?? "id") ??
            trimId(params.anchorRecord.id)
        );
    }
    return resolveLayoutRuntimeIdPath(params.rowRecord ?? params.anchorRecord, action.idPath);
}

export function layoutRuntimeAdornmentIsLinkable(adornment?: LayoutFieldAdornment): boolean {
    return adornment?.action?.type === "open_drawer";
}

export function layoutRuntimeAdornmentEntityLabel(entity: LayoutAdornmentActionEntity): string {
    if (entity === "child") return "child";
    if (entity === "person") return "person";
    return "opportunity";
}

export { resolveLayoutRuntimeChildPersonId } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
