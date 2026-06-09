/**
 * Queue row layout adornment → drawer open via canonical dispatch.
 */

import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { openInquiryChildPersonFromOpportunity } from "@/lib/admin/drawer/openInquiryChildPersonFromOpportunity";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import {
    logChildLinkDispatch,
    logChildLinkResolvedTarget,
    logChildLinkStep,
    logPersonLinkStep,
    summarizeLayoutRuntimeLinkRow,
} from "@/lib/layout/runtime/childLinkBrowserTrace";
import {
    dispatchLayoutRuntimeOpenDrawer,
    getLayoutRuntimeChildOpenTargetForTrace,
} from "@/lib/layout/runtime/dispatchLayoutRuntimeOpenDrawer";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    reportLayoutRuntimeLinkAsyncResultDebug,
    reportLayoutRuntimeLinkDispatchDebug,
    reportLayoutRuntimeLinkOpenDrawerCalledDebug,
} from "@/lib/layout/runtime/reportLayoutRuntimeLinkDispatchDebug";

export type QueueLayoutDrawerIconHandlers = {
    onOpenPerson: (personId: string) => void;
    onOpenChild: (childPersonId: string) => void;
    onPrefetchPerson?: (personId: string) => void;
    onPrefetchChild?: (childPersonId: string) => void;
};

/** Map queue adornment actions → workspace drawer handlers through canonical dispatch. */
export function buildQueueLayoutRuntimeAdornmentHandler(
    record: ProofRuntimeRecord,
    handlers: QueueLayoutDrawerIconHandlers | undefined,
): AdornmentActionHandler | undefined {
    if (!handlers) return undefined;
    return (item: LayoutItem, adornment: LayoutFieldAdornment, rowRecord?: ProofRuntimeRecord) => {
        const action = adornment.action;
        if (!action || action.type !== "open_drawer") return;

        const rowKey = rowRecord?.id != null ? String(rowRecord.id) : null;
        const isChild = action.entity === "child";
        const isPerson = action.entity === "person";

        if (isChild) {
            logChildLinkStep("row", {
                surface: "queue",
                rowKey,
                row: summarizeLayoutRuntimeLinkRow(rowRecord),
                refKey: item.refKey,
                idPath: action.idPath ?? null,
            });
        } else if (isPerson) {
            logPersonLinkStep("row", {
                surface: "queue",
                rowKey,
                row: summarizeLayoutRuntimeLinkRow(rowRecord ?? record),
                refKey: item.refKey,
                idPath: action.idPath ?? null,
            });
        }

        const openTarget = getLayoutRuntimeChildOpenTargetForTrace({
            item,
            adornment,
            anchorRecord: record,
            rowRecord,
        });

        if (isChild && openTarget) {
            logChildLinkResolvedTarget({
                surface: "queue",
                rowKey,
                rowRecord,
                openTarget,
                resolvedTargetId: openTarget.personId,
            });
        }

        const dispatchResult = dispatchLayoutRuntimeOpenDrawer({
            item,
            adornment,
            anchorRecord: record,
            rowRecord,
            opportunityId: String(record["opportunity.id"] ?? record.id ?? ""),
            opportunityRecord: record,
            openDrawer: (params) => {
                if (params.type !== "persons") return;
                const id = params.id.trim();
                if (!id) return;
                if (params.source === PERSON_DRAWER_CHILD_OPEN_SOURCE) {
                    logChildLinkStep("open-drawer-called", {
                        surface: "queue",
                        rowKey,
                        resolvedTargetId: id,
                        openMethod: "queueAdapter.onOpenChild",
                        urlOrApi: "workspace.onAction:open_child_drawer",
                    });
                    reportLayoutRuntimeLinkOpenDrawerCalledDebug();
                    handlers.onPrefetchChild?.(id);
                    handlers.onOpenChild(id);
                } else {
                    logPersonLinkStep("open-drawer-called", {
                        surface: "queue",
                        rowKey,
                        resolvedTargetId: id,
                        openMethod: "queueAdapter.onOpenPerson",
                        urlOrApi: "workspace.onAction:open_person_drawer",
                    });
                    reportLayoutRuntimeLinkOpenDrawerCalledDebug();
                    handlers.onPrefetchPerson?.(id);
                    handlers.onOpenPerson(id);
                }
            },
        });

        reportLayoutRuntimeLinkDispatchDebug(dispatchResult, {
            asyncResolving:
                isChild
                && !dispatchResult.ok
                && Boolean(openTarget?.customerMemberId)
                && (dispatchResult.step === "resolving_person_id" || dispatchResult.step === "missing_entity_id"),
        });

        if (!dispatchResult.ok && dispatchResult.step === "missing_entity_id" && process.env.NODE_ENV !== "production") {
            console.warn("[layout-runtime][queue-link] missing_entity_id", {
                entity: dispatchResult.entity ?? action.entity,
                refKey: item.refKey,
                idPath: action.idPath ?? null,
            });
        }

        if (isChild && openTarget) {
            logChildLinkDispatch({
                surface: "queue",
                rowKey,
                openMethod: dispatchResult.ok ? dispatchResult.route : (dispatchResult.route ?? "unknown"),
                ok: dispatchResult.ok,
                failureReason: dispatchResult.ok ? undefined : dispatchResult.step,
                entityId: dispatchResult.ok ? dispatchResult.entityId : openTarget.personId,
            });
        } else if (isPerson) {
            logPersonLinkStep("dispatch", {
                surface: "queue",
                rowKey,
                success: dispatchResult.ok,
                failureReason: dispatchResult.ok ? null : dispatchResult.step,
                openMethod: dispatchResult.ok ? dispatchResult.route : null,
            });
        }

        if (
            isChild
            && !dispatchResult.ok
            && openTarget
            && (dispatchResult.step === "resolving_person_id" || dispatchResult.step === "missing_entity_id")
            && openTarget.customerMemberId
        ) {
            logChildLinkStep("vm-request-start", {
                surface: "queue",
                rowKey,
                resolvedTargetId: openTarget.customerMemberId,
                openMethod: "openInquiryChildPersonFromOpportunity:async",
                urlOrApi: `/api/admin/customer-members/${openTarget.customerMemberId}`,
            });
            void openInquiryChildPersonFromOpportunity({
                openDrawer: (params) => {
                    if (params.type !== "persons") return;
                    const id = params.id.trim();
                    if (!id) return;
                    logChildLinkStep("open-drawer-called", {
                        surface: "queue",
                        rowKey,
                        resolvedTargetId: id,
                        openMethod: "openInquiryChildPersonFromOpportunity",
                        urlOrApi: "useAdminDrawer.openDrawer",
                    });
                    handlers.onPrefetchChild?.(id);
                    handlers.onOpenChild(id);
                },
                opportunityRecord: record,
                opportunityId: String(record["opportunity.id"] ?? record.id ?? ""),
                row: {
                    person_id: openTarget.personId,
                    customer_member_id: openTarget.customerMemberId,
                },
            }).then((opened) => {
                logChildLinkStep("vm-request-result", {
                    surface: "queue",
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
    };
}
