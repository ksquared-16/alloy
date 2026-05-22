/**
 * Ephemeral click acknowledgement for dept oper cards before hard navigation.
 * Separate from `runAdminV2NavigationTransition` — does not delay or replace `adminV2CommitNavigation`.
 */

let pendingClickedKey: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
    for (const listener of listeners) {
        listener();
    }
}

export function deptOperNavClickedKey(href: string): string {
    return `dept-oper:${href.trim()}`;
}

export function markDeptOperNavClickAck(clickedKey: string): void {
    const key = clickedKey.trim();
    if (!key) return;
    pendingClickedKey = key;
    emit();
}

export function getDeptOperNavClickAckSnapshot(): string | null {
    return pendingClickedKey;
}

export function subscribeDeptOperNavClickAck(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function isDeptOperNavClickPending(clickedKey: string | null | undefined): boolean {
    if (!clickedKey || !pendingClickedKey) return false;
    return pendingClickedKey === clickedKey;
}

export function deptOperNavClickAckProps(clickedKey: string | null | undefined): {
    "aria-busy"?: true;
    "data-adminv2-nav-pending"?: "true";
} {
    if (!isDeptOperNavClickPending(clickedKey)) return {};
    return { "aria-busy": true, "data-adminv2-nav-pending": "true" };
}

/** Test-only reset. */
export function resetDeptOperNavClickAckForTests(): void {
    pendingClickedKey = null;
    emit();
}
