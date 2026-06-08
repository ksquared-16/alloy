/**
 * Layout runtime adornment → drawer open (production path).
 */

import { openInquiryChildPersonFromOpportunity } from "@/lib/admin/drawer/openInquiryChildPersonFromOpportunity";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    openViewPersonFromOpportunity,
    type OpenDrawerFromOpportunityFn,
} from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

export function resolveLayoutRuntimeIdPath(
    record: ProofRuntimeRecord,
    idPath: string | undefined,
): string | null {
    if (!idPath?.trim()) return null;
    const flat = trimId(record[idPath]);
    if (flat) return flat;
    const parts = idPath.split(".").filter(Boolean);
    let cur: unknown = record;
    for (const part of parts) {
        if (cur == null || typeof cur !== "object") return null;
        cur = (cur as Record<string, unknown>)[part];
    }
    return trimId(cur);
}

export type LayoutRuntimeAdornmentOpenDrawerParams = {
    item: LayoutItem;
    adornment: LayoutFieldAdornment;
    record: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    opportunityId?: string | null;
    opportunityRecord?: Record<string, unknown> | null;
    openDrawer: OpenDrawerFromOpportunityFn;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
};

function findInquiryChildRowForLayoutOpen(
    opportunityRecord: Record<string, unknown>,
    layoutRow: ProofRuntimeRecord,
    childPersonId: string,
) {
    const raw = opportunityRecord._inquiry_children;
    if (!Array.isArray(raw)) return null;
    const rows = mapRawInquiryChildrenToDrawerRows(raw);
    const rowId = trimId(layoutRow.id);
    return (
        rows.find((r) => trimId(r.person_id) === childPersonId) ??
        rows.find((r) => trimId(r.id) === rowId) ??
        null
    );
}

export function handleLayoutRuntimeAdornmentOpenDrawer(params: LayoutRuntimeAdornmentOpenDrawerParams): void {
    const action = params.adornment.action;
    if (!action || action.type !== "open_drawer") return;

    const row = params.rowRecord;
    const source = row ?? params.record;
    const entityId = resolveLayoutRuntimeIdPath(source, action.idPath);
    const opportunityId = trimId(params.opportunityId) ?? trimId(params.record.id);
    if (!entityId && action.entity !== "person") return;

    if (action.entity === "person") {
        const personId =
            entityId ??
            resolveLayoutRuntimeIdPath(params.record, "opportunity.primary_person_id") ??
            resolveLayoutRuntimeIdPath(params.record, "_primary_person_id");
        if (!personId) return;
        openViewPersonFromOpportunity({
            openDrawer: params.openDrawer,
            personId,
            opportunityId: opportunityId ?? "",
            source: "opportunity_primary_contact",
            opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
        });
        return;
    }

    if (action.entity === "child") {
        if (params.opportunityRecord && row) {
            const childId = resolveLayoutRuntimeIdPath(row, "child.id") ?? entityId;
            if (!childId) return;
            const inquiryRow = findInquiryChildRowForLayoutOpen(params.opportunityRecord, row, childId);
            void openInquiryChildPersonFromOpportunity({
                openDrawer: params.openDrawer,
                opportunityRecord: params.opportunityRecord,
                opportunityId: opportunityId ?? "",
                row: inquiryRow ?? {
                    person_id: childId,
                    display_name: resolveLayoutRuntimeIdPath(row, "child.name") ?? undefined,
                },
                opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
            });
            return;
        }

        if (!entityId) return;
        openViewPersonFromOpportunity({
            openDrawer: params.openDrawer,
            personId: entityId,
            opportunityId: opportunityId ?? "",
            source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
            opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
        });
    }
}
