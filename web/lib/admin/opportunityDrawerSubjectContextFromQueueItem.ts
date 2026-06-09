import { buildDrawerSubjectContextFromQueueRowContext } from "@/lib/workUnits/buildDrawerSubjectContextFromQueueRowContext";
import type { DrawerSubjectContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

/** Drawer subject context from queue preview row `_queue_row_context` when present. */
export function opportunityDrawerSubjectContextFromQueueItem(
    item: QueuePreviewItemVm | null | undefined,
): DrawerSubjectContext | null {
    return buildDrawerSubjectContextFromQueueRowContext(item?._queue_row_context ?? null);
}
