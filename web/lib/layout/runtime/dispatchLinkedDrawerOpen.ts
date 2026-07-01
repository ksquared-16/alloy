/**
 * Single linked-drawer open path for queue rows and layout-runtime link surfaces.
 */

import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import type { QueueRecordFieldLinkTarget } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import {
    buildQueueLayoutRuntimeAdornmentHandler,
    type QueueLayoutDrawerIconHandlers,
} from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";
import { dispatchLayoutRuntimeOpenDrawer } from "@/lib/layout/runtime/dispatchLayoutRuntimeOpenDrawer";
import { resolveLayoutRuntimeChildOpenTarget } from "@/lib/layout/runtime/resolveLayoutRuntimeChildOpenTarget";
import { logQueueRowLinkDispatch } from "@/lib/debug/queueRowClickDebug";
import {
    isolateLayoutRuntimeLinkClick,
    type LayoutRuntimeIsolatableClickEvent,
} from "@/lib/layout/runtime/isolateLayoutRuntimeLinkClick";
import { linkTargetEntity, queueRecordFieldToLayoutItem } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { resolveQueueRecordLinkTargetId } from "@/lib/layout/runtime/resolveQueueRecordLinkTargetId";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LinkedDrawerOpenSource = "queue_record" | "drawer_field" | "related_block";

export type LinkedDrawerOpenTarget = QueueRecordFieldLinkTarget;

export type DispatchLinkedDrawerOpenParams = {
    target: LinkedDrawerOpenTarget;
    id?: string | null;
    source: LinkedDrawerOpenSource;
    event?: LayoutRuntimeIsolatableClickEvent;
    handlers?: QueueLayoutDrawerIconHandlers;
    onOpenOpportunity?: () => void;
    /** Adornment fallback when id is missing (async child member resolution). */
    field?: QueueRecordFieldConfig;
    item?: LayoutItem;
    record?: ProofRuntimeRecord;
    anchorRecord?: ProofRuntimeRecord;
};

function warnMissingLink(source: LinkedDrawerOpenSource, target: LinkedDrawerOpenTarget, detail: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;
    console.warn("[layout-runtime][linked-drawer] missing target id", { source, target, ...detail });
}

function warnMissingHandlers(source: LinkedDrawerOpenSource, target: LinkedDrawerOpenTarget): void {
    if (process.env.NODE_ENV === "production") return;
    console.warn("[layout-runtime][linked-drawer] missing drawer handlers", { source, target });
}

function openViaHandlers(
    target: LinkedDrawerOpenTarget,
    id: string,
    handlers: QueueLayoutDrawerIconHandlers,
): boolean {
    if (target === "person_drawer") {
        handlers.onPrefetchPerson?.(id);
        handlers.onOpenPerson(id);
        return true;
    }
    if (target === "child_drawer" || target === "related_record_drawer") {
        handlers.onPrefetchChild?.(id);
        handlers.onOpenChild(id);
        return true;
    }
    return false;
}

function openViaAdornmentFallback(params: DispatchLinkedDrawerOpenParams): boolean {
    if (!params.field || !params.record || !params.anchorRecord || !params.handlers) return false;

    const item = params.item ?? queueRecordFieldToLayoutItem(params.field);
    const entity = linkTargetEntity(params.target);
    if (!entity || entity === "opportunity") return false;

    const adornment: LayoutFieldAdornment =
        item.adornment ??
        ({
            position: "left",
            icon: params.field.icon ?? (entity === "child" ? "child" : "person"),
            action: {
                type: "open_drawer",
                entity,
                idPath:
                    params.field.link?.idFieldKey
                    ?? (entity === "child" ? "child.id" : "opportunity.primary_person_id"),
            },
        } as LayoutFieldAdornment);

    const rowRecord = params.record !== params.anchorRecord ? params.record : undefined;
    const handlers = params.handlers;
    let opened = false;

    const dispatchResult = dispatchLayoutRuntimeOpenDrawer({
        item,
        adornment,
        anchorRecord: params.anchorRecord,
        rowRecord,
        opportunityId: String(params.anchorRecord["opportunity.id"] ?? params.anchorRecord.id ?? ""),
        opportunityRecord: params.anchorRecord,
        openDrawer: (openParams) => {
            if (openParams.type !== "persons") return;
            const id = openParams.id.trim();
            if (!id) return;
            opened = true;
            if (openParams.source === PERSON_DRAWER_CHILD_OPEN_SOURCE) {
                handlers.onPrefetchChild?.(id);
                handlers.onOpenChild(id);
            } else {
                handlers.onPrefetchPerson?.(id);
                handlers.onOpenPerson(id);
            }
        },
    });

    if (dispatchResult.ok) return opened;

    if (
        entity === "child"
        && (dispatchResult.step === "resolving_person_id" || dispatchResult.step === "missing_entity_id")
    ) {
        const openTarget = resolveLayoutRuntimeChildOpenTarget(rowRecord ?? params.record, {
            idPath: adornment.action?.idPath,
            refKey: item.refKey,
            anchorRecord: params.anchorRecord,
        });
        if (openTarget.customerMemberId) {
            const handler = buildQueueLayoutRuntimeAdornmentHandler(params.anchorRecord, handlers);
            handler?.(item, adornment, rowRecord);
            return true;
        }
    }

    return false;
}

/**
 * Open a linked drawer from a queue row or layout-runtime field.
 * Always isolates the click when an event is provided. Never falls through to row open.
 */
export function dispatchLinkedDrawerOpen(params: DispatchLinkedDrawerOpenParams): boolean {
    const propagationStopped = Boolean(params.event);
    if (params.event) {
        isolateLayoutRuntimeLinkClick(params.event);
    }

    const target = params.target;
    if (!target || target === "none") return false;

    if (target === "opportunity_drawer") {
        if (!params.onOpenOpportunity) {
            warnMissingHandlers(params.source, target);
            logQueueRowLinkDispatch({
                surface: params.source,
                linkTarget: target,
                resolvedEntityId: null,
                dispatchOk: false,
                record: params.record,
                anchorRecord: params.anchorRecord,
                propagationStopped,
            });
            return false;
        }
        params.onOpenOpportunity();
        logQueueRowLinkDispatch({
            surface: params.source,
            linkTarget: target,
            resolvedEntityId:
                params.anchorRecord?.["opportunity.id"] != null
                    ? String(params.anchorRecord["opportunity.id"])
                    : params.anchorRecord?.id != null
                      ? String(params.anchorRecord.id)
                      : null,
            dispatchOk: true,
            record: params.record,
            anchorRecord: params.anchorRecord,
            propagationStopped,
            handler: "onOpenOpportunity",
        });
        return true;
    }

    if (!params.handlers) {
        warnMissingHandlers(params.source, target);
        logQueueRowLinkDispatch({
            surface: params.source,
            linkTarget: target,
            resolvedEntityId: null,
            dispatchOk: false,
            record: params.record,
            anchorRecord: params.anchorRecord,
            propagationStopped,
        });
        return false;
    }

    const resolvedId =
        params.id?.trim()
        || (params.field && params.record && params.anchorRecord
            ? resolveQueueRecordLinkTargetId(params.field, params.record, params.anchorRecord)
            : null)
        || null;

    if (resolvedId) {
        const ok = openViaHandlers(target, resolvedId, params.handlers);
        logQueueRowLinkDispatch({
            surface: params.source,
            linkTarget: target,
            resolvedEntityId: resolvedId,
            dispatchOk: ok,
            record: params.record,
            anchorRecord: params.anchorRecord,
            propagationStopped,
            handler: target === "person_drawer" ? "handlers.onOpenPerson" : "handlers.onOpenChild",
        });
        return ok;
    }

    // Async child member→person resolution only; person/opportunity must have a resolved id.
    if (target === "child_drawer" || target === "related_record_drawer") {
        if (openViaAdornmentFallback(params)) {
            logQueueRowLinkDispatch({
                surface: params.source,
                linkTarget: target,
                resolvedEntityId: null,
                dispatchOk: true,
                record: params.record,
                anchorRecord: params.anchorRecord,
                propagationStopped,
                handler: "openViaAdornmentFallback",
            });
            return true;
        }
    }

    warnMissingLink(params.source, target, {
        fieldKey: params.field?.fieldKey ?? null,
        recordId: params.record?.id ?? null,
    });
    logQueueRowLinkDispatch({
        surface: params.source,
        linkTarget: target,
        resolvedEntityId: null,
        dispatchOk: false,
        record: params.record,
        anchorRecord: params.anchorRecord,
        propagationStopped,
    });
    return false;
}
