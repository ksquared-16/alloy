/**
 * Queue row linked-field drawer open — delegates to dispatchLinkedDrawerOpen.
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import { dispatchLinkedDrawerOpen } from "@/lib/layout/runtime/dispatchLinkedDrawerOpen";
import type { LayoutRuntimeIsolatableClickEvent } from "@/lib/layout/runtime/isolateLayoutRuntimeLinkClick";
import type { QueueLayoutDrawerIconHandlers } from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type OpenQueueRecordLinkedDrawerParams = {
    field: QueueRecordFieldConfig;
    item?: LayoutItem;
    record: ProofRuntimeRecord;
    anchorRecord: ProofRuntimeRecord;
    handlers?: QueueLayoutDrawerIconHandlers;
    onOpenOpportunity?: () => void;
    event?: LayoutRuntimeIsolatableClickEvent;
};

/** Open the configured drawer for a queue row linked field. Returns true when a handler ran. */
export function openQueueRecordLinkedDrawer(params: OpenQueueRecordLinkedDrawerParams): boolean {
    const target = params.field.link?.target;
    if (!target || target === "none") return false;

    return dispatchLinkedDrawerOpen({
        target,
        source: "queue_record",
        event: params.event,
        handlers: params.handlers,
        onOpenOpportunity: params.onOpenOpportunity,
        field: params.field,
        item: params.item,
        record: params.record,
        anchorRecord: params.anchorRecord,
    });
}
