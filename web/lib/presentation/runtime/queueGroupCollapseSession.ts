/**
 * Session-local collapse state for configured queue group headers.
 * Presentation only — never operational truth / no DB persistence.
 */

const STORAGE_PREFIX = "alloy.queue-group-collapse.v1";

export function queueGroupCollapseStorageKey(args: {
    workUnitId: string | null | undefined;
    workViewId: string | null | undefined;
    groupKind: string;
    groupValue: string;
}): string {
    const wu = args.workUnitId?.trim() || "_";
    const view = args.workViewId?.trim() || "_";
    const kind = args.groupKind.trim() || "group";
    const value = args.groupValue.trim() || "_";
    return `${STORAGE_PREFIX}:${wu}:${view}:${kind}:${value}`;
}

/** Default expanded (false = not collapsed). */
export function readQueueGroupCollapsed(storageKey: string): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.sessionStorage.getItem(storageKey) === "1";
    } catch {
        return false;
    }
}

export function writeQueueGroupCollapsed(storageKey: string, collapsed: boolean): void {
    if (typeof window === "undefined") return;
    try {
        if (collapsed) window.sessionStorage.setItem(storageKey, "1");
        else window.sessionStorage.removeItem(storageKey);
    } catch {
        /* private mode / quota — keep in-memory only */
    }
}
