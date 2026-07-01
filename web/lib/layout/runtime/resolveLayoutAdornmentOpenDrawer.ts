/**
 * Layout runtime adornment → drawer open (production path).
 */

import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import type { OpenDrawerFromOpportunityFn } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { inferLayoutAdornmentIdPath } from "@/lib/layout/inferLayoutAdornmentIdPath";
import {
    logChildLinkDispatch,
    logChildLinkResolvedTarget,
    logChildLinkStep,
    logPersonLinkStep,
    summarizeLayoutRuntimeLinkRow,
} from "@/lib/layout/runtime/childLinkBrowserTrace";
import { openInquiryChildPersonFromOpportunity } from "@/lib/admin/drawer/openInquiryChildPersonFromOpportunity";
import { dispatchLayoutRuntimeOpenDrawer, getLayoutRuntimeChildOpenTargetForTrace } from "@/lib/layout/runtime/dispatchLayoutRuntimeOpenDrawer";
import {
    reportLayoutRuntimeLinkAsyncResultDebug,
    reportLayoutRuntimeLinkDispatchDebug,
    reportLayoutRuntimeLinkOpenDrawerCalledDebug,
} from "@/lib/layout/runtime/reportLayoutRuntimeLinkDispatchDebug";
import {
    resolveLayoutRuntimeChildPersonId,
    resolveLayoutRuntimePersonIdForOpen,
} from "@/lib/layout/runtime/resolveLayoutRuntimeLinkedEntityId";
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

export function handleLayoutRuntimeAdornmentOpenDrawer(params: LayoutRuntimeAdornmentOpenDrawerParams): void {
    const action = params.adornment.action;
    const rowKey = params.rowRecord?.id != null ? String(params.rowRecord.id) : null;
    const surface = "opportunity_drawer" as const;

    if (action?.entity === "child") {
        logChildLinkStep("row", {
            surface,
            rowKey,
            row: summarizeLayoutRuntimeLinkRow(params.rowRecord),
            refKey: params.item.refKey,
            idPath: action.idPath ?? null,
        });
    } else if (action?.entity === "person") {
        logPersonLinkStep("row", {
            surface,
            rowKey,
            row: summarizeLayoutRuntimeLinkRow(params.rowRecord ?? params.record),
            refKey: params.item.refKey,
            idPath: action.idPath ?? null,
        });
    }

    const openTarget =
        action?.entity === "child"
            ? getLayoutRuntimeChildOpenTargetForTrace({
                  item: params.item,
                  adornment: params.adornment,
                  anchorRecord: params.record,
                  rowRecord: params.rowRecord,
              })
            : null;

    if (action?.entity === "child" && openTarget) {
        logChildLinkResolvedTarget({
            surface,
            rowKey,
            rowRecord: params.rowRecord,
            openTarget,
            resolvedTargetId: openTarget.personId,
        });
    }

    const dispatchResult = dispatchLayoutRuntimeOpenDrawer({
        item: params.item,
        adornment: params.adornment,
        anchorRecord: params.record,
        rowRecord: params.rowRecord,
        opportunityId: params.opportunityId,
        opportunityRecord: params.opportunityRecord ?? params.record,
        openDrawer: (openParams) => {
            if (action?.entity === "child" && openParams.type === "persons") {
                logChildLinkStep("open-drawer-called", {
                    surface,
                    rowKey,
                    resolvedTargetId: openParams.id,
                    openMethod: "useAdminDrawer.openDrawer",
                    urlOrApi: "AdminDrawerContext.openDrawer",
                });
                reportLayoutRuntimeLinkOpenDrawerCalledDebug();
            } else if (action?.entity === "person" && openParams.type === "persons") {
                logPersonLinkStep("open-drawer-called", {
                    surface,
                    rowKey,
                    resolvedTargetId: openParams.id,
                    openMethod: "useAdminDrawer.openDrawer",
                    urlOrApi: "AdminDrawerContext.openDrawer",
                });
                reportLayoutRuntimeLinkOpenDrawerCalledDebug();
            }
            params.openDrawer(openParams);
        },
        opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
    });

    reportLayoutRuntimeLinkDispatchDebug(dispatchResult, {
        asyncResolving:
            action?.entity === "child"
            && !dispatchResult.ok
            && Boolean(openTarget?.customerMemberId)
            && (dispatchResult.step === "resolving_person_id" || dispatchResult.step === "missing_entity_id"),
    });

    if (action?.entity === "child" && openTarget) {
        logChildLinkDispatch({
            surface,
            rowKey,
            openMethod: dispatchResult.ok ? dispatchResult.route : (dispatchResult.route ?? "unknown"),
            ok: dispatchResult.ok,
            failureReason: dispatchResult.ok ? undefined : dispatchResult.step,
            entityId: dispatchResult.ok ? dispatchResult.entityId : openTarget.personId,
        });
    } else if (action?.entity === "person") {
        logPersonLinkStep("dispatch", {
            surface,
            rowKey,
            success: dispatchResult.ok,
            failureReason: dispatchResult.ok ? null : dispatchResult.step,
            openMethod: dispatchResult.ok ? dispatchResult.route : null,
        });
    }

    if (
        action?.entity === "child"
        && !dispatchResult.ok
        && openTarget
        && (dispatchResult.step === "resolving_person_id" || dispatchResult.step === "missing_entity_id")
        && openTarget.customerMemberId
        && params.opportunityRecord
    ) {
        logChildLinkStep("vm-request-start", {
            surface,
            rowKey,
            resolvedTargetId: openTarget.customerMemberId,
            openMethod: "openInquiryChildPersonFromOpportunity:async",
            urlOrApi: `/api/admin/customer-members/${openTarget.customerMemberId}`,
        });
        void openInquiryChildPersonFromOpportunity({
            openDrawer: params.openDrawer,
            opportunityRecord: params.opportunityRecord,
            opportunityId: String(params.opportunityId ?? params.record.id ?? ""),
            row: {
                person_id: openTarget.personId,
                customer_member_id: openTarget.customerMemberId,
            },
            opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
        }).then((opened) => {
            logChildLinkStep("vm-request-result", {
                surface,
                rowKey,
                success: opened,
                failureReason: opened ? null : "openInquiryChildPersonFromOpportunity_returned_false",
            });
            reportLayoutRuntimeLinkAsyncResultDebug(
                opened,
                opened ? undefined : "openInquiryChildPersonFromOpportunity_returned_false",
            );
        });
    }
}

export type PersonDrawerLayoutRuntimeAdornmentOpenDrawerParams = {
    item: LayoutItem;
    adornment: LayoutFieldAdornment;
    record: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    personRecord: Record<string, unknown>;
    openDrawer: OpenDrawerFromOpportunityFn;
    opportunityId?: string | null;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    isChildSurface: boolean;
};

/** Person/child drawer layout adornment → warm linked drawer navigation. */
export function handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer(
    params: PersonDrawerLayoutRuntimeAdornmentOpenDrawerParams,
): void {
    const action = params.adornment.action;
    if (!action || action.type !== "open_drawer") return;

    const row = params.rowRecord;
    const source = row ?? params.record;
    const entityId =
        resolveLayoutRuntimeIdPath(source, action.idPath) ??
        resolveLayoutRuntimeIdPath(source, inferLayoutAdornmentIdPath(action.entity, params.item.refKey));
    const opportunityId = trimId(params.opportunityId);
    const ws = params.opportunityWorkspaceContext ?? null;

    if (action.entity === "child") {
        const childPersonId = resolveLayoutRuntimeChildPersonId(
            source,
            action.idPath,
            params.item.refKey,
            params.record,
        );
        if (!childPersonId) return;
        params.openDrawer({
            type: "persons",
            id: childPersonId,
            source: PERSON_DRAWER_CHILD_OPEN_SOURCE,
            opportunityWorkspaceContext: ws ?? undefined,
            personDrawerOpenSeed: {
                personId: childPersonId,
                opportunity_id: opportunityId ?? undefined,
                presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
            },
        });
        return;
    }

    if (action.entity === "person") {
        const personId = resolveLayoutRuntimePersonIdForOpen(
            params.record,
            row,
            action.idPath,
            params.item.refKey,
        );
        if (!personId) return;
        params.openDrawer({
            type: "persons",
            id: personId,
            source: "person_household_link",
            opportunityWorkspaceContext: ws ?? undefined,
            personDrawerOpenSeed: {
                personId,
                opportunity_id: opportunityId ?? undefined,
            },
        });
        return;
    }

    if (action.entity === "opportunity" || action.entity === "opportunities") {
        const oppId = entityId ?? opportunityId;
        if (!oppId) return;
        params.openDrawer({
            type: "opportunities",
            id: oppId,
            opportunityWorkspaceContext: ws ?? undefined,
        });
    }
}
