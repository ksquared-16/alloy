/**
 * Single layout-runtime open_drawer dispatch (queue + drawer related lists).
 */

import { openInquiryChildPersonFromOpportunity } from "@/lib/admin/drawer/openInquiryChildPersonFromOpportunity";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    buildInquiryChildPersonOpenSeed,
    isSyntheticInquiryChildMemberId,
    resolveInquiryChildOpenPersonId,
} from "@/lib/admin/drawer/inquiryChildPersonOpen";
import {
    openViewPersonFromOpportunity,
    type OpenDrawerFromOpportunityFn,
} from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import {
    resolveLayoutRuntimeLinkedEntityId,
    resolveLayoutRuntimePersonIdForOpen,
} from "@/lib/layout/runtime/resolveLayoutRuntimeLinkedEntityId";
import { resolveLayoutRuntimeIdPath } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import {
    resolveLayoutRuntimeChildOpenTarget,
} from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function findInquiryChildRow(
    opportunityRecord: Record<string, unknown>,
    layoutRow: ProofRuntimeRecord,
    childPersonId: string | null,
    customerMemberId: string | null,
) {
    const raw = opportunityRecord._inquiry_children;
    if (!Array.isArray(raw)) return null;
    const rows = mapRawInquiryChildrenToDrawerRows(raw);
    const rowId = trimId(layoutRow.id);
    const ocmId = trimId(layoutRow.ocm_id);
    return (
        (childPersonId ? rows.find((r) => trimId(r.person_id) === childPersonId) : null)
        ?? (customerMemberId ? rows.find((r) => trimId(r.customer_member_id) === customerMemberId) : null)
        ?? (ocmId ? rows.find((r) => trimId(r.ocm_id) === ocmId || trimId(r.id) === ocmId) : null)
        ?? (rowId ? rows.find((r) => trimId(r.id) === rowId) : null)
        ?? null
    );
}

export type LayoutRuntimeOpenDrawerDispatchParams = {
    item: LayoutItem;
    adornment: LayoutFieldAdornment;
    anchorRecord: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    opportunityId?: string | null;
    opportunityRecord?: Record<string, unknown> | null;
    openDrawer: OpenDrawerFromOpportunityFn;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
};

export type LayoutRuntimeOpenDrawerDispatchResult =
    | { ok: true; entity: "person" | "child" | "opportunity"; entityId: string; route: string }
    | {
          ok: false;
          step: "no_action" | "missing_entity_id" | "open_failed" | "resolving_person_id";
          entity?: string;
          route?: string;
      };

/** Canonical open_drawer pipeline for layout adornments. */
export function dispatchLayoutRuntimeOpenDrawer(
    params: LayoutRuntimeOpenDrawerDispatchParams,
): LayoutRuntimeOpenDrawerDispatchResult {
    const action = params.adornment.action;
    if (!action || action.type !== "open_drawer") {
        return { ok: false, step: "no_action" };
    }

    const row = params.rowRecord;
    const source = row ?? params.anchorRecord;
    const opportunityId = trimId(params.opportunityId) ?? trimId(params.anchorRecord.id) ?? "";
    const ws = params.opportunityWorkspaceContext ?? null;
    const opportunityRecord = (params.opportunityRecord ?? params.anchorRecord) as Record<string, unknown>;

    if (action.entity === "person") {
        const personId = resolveLayoutRuntimePersonIdForOpen(
            params.anchorRecord,
            row,
            action.idPath,
            params.item.refKey,
        );
        if (!personId) return { ok: false, step: "missing_entity_id", entity: "person" };
        const opened = openViewPersonFromOpportunity({
            openDrawer: params.openDrawer,
            personId,
            opportunityId,
            source: "opportunity_primary_contact",
            opportunityWorkspaceContext: ws,
        });
        return opened ?
                { ok: true, entity: "person", entityId: personId, route: "openViewPersonFromOpportunity" }
            :   { ok: false, step: "open_failed", entity: "person", route: "openViewPersonFromOpportunity" };
    }

    if (action.entity === "child") {
        const openTarget = resolveLayoutRuntimeChildOpenTarget(source, {
            idPath: action.idPath,
            refKey: params.item.refKey,
            anchorRecord: params.anchorRecord,
        });

        const inquiryRow =
            row ?
                findInquiryChildRow(opportunityRecord, row, openTarget.personId, openTarget.customerMemberId)
            :   null;

        let personId = openTarget.personId;
        if (!personId && inquiryRow) {
            personId =
                trimId(inquiryRow.person_id)
                ?? trimId(resolveInquiryChildOpenPersonId(opportunityRecord, inquiryRow));
            if (personId && openTarget.customerMemberId && personId === openTarget.customerMemberId) {
                personId = null;
            }
        }

        const displayName =
            resolveLayoutRuntimeIdPath(source, "child.name")
            ?? resolveLayoutRuntimeIdPath(source, "child.display_name")
            ?? undefined;

        if (personId) {
            const openSeed = inquiryRow ?
                    buildInquiryChildPersonOpenSeed(opportunityRecord, inquiryRow, personId)
                :   {
                        personId,
                        opportunity_id: opportunityId || undefined,
                        presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
                        display_name: displayName,
                    };
            const opened = openViewPersonFromOpportunity({
                openDrawer: params.openDrawer,
                personId,
                opportunityId,
                source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
                openSeed,
                opportunityWorkspaceContext: ws,
            });
            return opened ?
                    {
                        ok: true,
                        entity: "child",
                        entityId: personId,
                        route: "openViewPersonFromOpportunity:child",
                    }
                :   {
                        ok: false,
                        step: "open_failed",
                        entity: "child",
                        route: "openViewPersonFromOpportunity:child",
                    };
        }

        const inquiryMemberId = trimId(inquiryRow?.customer_member_id) ?? openTarget.customerMemberId;
        if (inquiryRow && inquiryMemberId && !isSyntheticInquiryChildMemberId(inquiryMemberId)) {
            void openInquiryChildPersonFromOpportunity({
                openDrawer: params.openDrawer,
                opportunityRecord,
                opportunityId,
                row: inquiryRow,
                opportunityWorkspaceContext: ws,
            }).then((opened) => {
                if (!opened && process.env.NODE_ENV !== "production") {
                    console.warn("[layout-runtime][child-link]", {
                        surface: "dispatch",
                        result: "failed",
                        failurePoint: "openInquiryChildPersonFromOpportunity",
                        customerMemberId: inquiryMemberId,
                    });
                }
            });
            return {
                ok: false,
                step: "resolving_person_id",
                entity: "child",
                route: "openInquiryChildPersonFromOpportunity:async",
            };
        }

        return { ok: false, step: "missing_entity_id", entity: "child", route: "missing_person_id" };
    }

    if (action.entity === "opportunity") {
        const entityId =
            resolveLayoutRuntimeLinkedEntityId(action, {
                anchorRecord: params.anchorRecord,
                rowRecord: row,
                refKey: params.item.refKey,
            }) ?? opportunityId;
        if (!entityId) return { ok: false, step: "missing_entity_id", entity: "opportunity" };
        params.openDrawer({
            type: "opportunities",
            id: entityId,
            opportunityWorkspaceContext: ws ?? undefined,
        });
        return { ok: true, entity: "opportunity", entityId, route: "openDrawer:opportunities" };
    }

    return { ok: false, step: "no_action" };
}

export function getLayoutRuntimeChildOpenTargetForTrace(
    params: Pick<LayoutRuntimeOpenDrawerDispatchParams, "item" | "adornment" | "anchorRecord" | "rowRecord">,
) {
    const action = params.adornment.action;
    if (!action || action.entity !== "child") return null;
    const source = params.rowRecord ?? params.anchorRecord;
    return resolveLayoutRuntimeChildOpenTarget(source, {
        idPath: action.idPath,
        refKey: params.item.refKey,
        anchorRecord: params.anchorRecord,
    });
}
