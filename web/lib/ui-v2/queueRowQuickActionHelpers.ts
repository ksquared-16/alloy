import type { QueueItemQuickActionVm } from "@/lib/ui-v2/workspace-types";

/** Normalize queue row quick action → host dispatch id. */
export function queueQuickActionDispatchId(qa: QueueItemQuickActionVm): string {
    const withAction = qa as QueueItemQuickActionVm & { actionId?: string };
    const payload = qa.payload as { actionType?: string; source?: string } | undefined;
    if (payload?.actionType === "open_drawer") return "open_record";
    if (typeof withAction.actionId === "string" && withAction.actionId.trim() === "open_record") {
        return "open_record";
    }
    if (qa.id === "open") return "open_record";
    if (typeof withAction.actionId === "string" && withAction.actionId.trim()) return withAction.actionId.trim();
    return qa.id;
}

/** True when action opens the primary record — row title handles open; exclude from Actions menu. */
export function isQueueRowOpenAction(qa: QueueItemQuickActionVm): boolean {
    const label = qa.label?.trim().toLowerCase() ?? "";
    return queueQuickActionDispatchId(qa) === "open_record" || label === "open";
}

/** Row actions for host dispatch — Open remains available for non-menu paths but is not menu-sorted. */
export function orderedQueueQuickActions(actions: QueueItemQuickActionVm[] | undefined): QueueItemQuickActionVm[] {
    if (!actions?.length) return [];
    return actions;
}

/** True when a quick action dispatches Ask BOS / registry BOS intent. */
export function isQueueRowBosAction(qa: QueueItemQuickActionVm): boolean {
    const withAction = qa as QueueItemQuickActionVm & { actionId?: string };
    const dispatchId = queueQuickActionDispatchId(qa);
    const payload = qa.payload as { intent?: string } | undefined;
    return (
        dispatchId === "ask_bos" ||
        withAction.actionId === "ask_bos" ||
        qa.id === "ask_bos" ||
        qa.id === "registry-ask_bos" ||
        payload?.intent === "ask_bos" ||
        /ask\s*bos/i.test(qa.label?.trim() ?? "")
    );
}

/** Split BOS into its own button; remaining lifecycle actions go in the Actions menu (not Open). */
export function partitionQueueRowActions(actions: QueueItemQuickActionVm[]): {
    menuActions: QueueItemQuickActionVm[];
    bosAction: QueueItemQuickActionVm | null;
} {
    const bosAction = actions.find(isQueueRowBosAction) ?? null;
    const menuActions = actions.filter((qa) => !isQueueRowBosAction(qa) && !isQueueRowOpenAction(qa));
    return { menuActions, bosAction };
}

/** Build quick-action VMs from fallback action label strings (CRM preview path). */
export function queueRowActionsFromLabels(labels: string[]): QueueItemQuickActionVm[] {
    return labels
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => {
            const lower = label.toLowerCase();
            if (lower === "open") return { id: "open", label: "Open" };
            if (/ask\s*bos/.test(lower)) return { id: "ask_bos", label: "Ask BOS", actionId: "ask_bos" };
            return { id: label.toLowerCase().replace(/\s+/g, "_"), label };
        });
}
