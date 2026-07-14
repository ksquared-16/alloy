/**
 * Session-retained operator context per Work Unit (Trust Closure §9). The operator's in-surface
 * selections — the selected Work View AND the selected record — do not live in the URL for in-page
 * navigation (same-host pill switches and queue-row opens are in-page), so a surface unmount would
 * lose them. This module holds them for the authenticated session (SPA lifetime), scoped by org +
 * work unit, so a return restores the operator's place (deployed acceptance: WU → /workspace → WU
 * must NOT drop the selected record, and returning to a populated view must reopen a record).
 *
 * The retained selected record is a NON-authoritative restoration hint, not a resurrection: it is
 * applied only when the record is still present in the current Work View's rows (precedence below).
 * An explicit URL record id always wins; a stale retained record that is no longer in the view is
 * ignored (fall through to first row). Still NOT retained: partially-composed mutation forms,
 * destructive confirmation state, transient errors.
 */

const selectedWorkViewByUnit = new Map<string, string>();

/** The operator's retained in-surface selection for a Work Unit (session-scoped). */
export type RetainedWorkUnitSelection = {
    workViewId: string | null;
    queueKey: string | null;
    selectedRecordId: string | null;
    updatedAt: number;
};

const selectionByUnit = new Map<string, RetainedWorkUnitSelection>();

function key(orgId: string | null, workUnitId: string | null): string {
    return `${orgId ?? "_"}:${workUnitId ?? "_"}`;
}

/** Retain (or clear, when selectedRecordId is null) the operator's selected record for a Work Unit. */
export function putRetainedSelection(
    orgId: string | null,
    workUnitId: string | null,
    selection: { workViewId: string | null; queueKey: string | null; selectedRecordId: string | null },
): void {
    if (!workUnitId) return;
    selectionByUnit.set(key(orgId, workUnitId), {
        workViewId: selection.workViewId,
        queueKey: selection.queueKey,
        selectedRecordId: selection.selectedRecordId,
        updatedAt: Date.now(),
    });
}

export function peekRetainedSelection(
    orgId: string | null,
    workUnitId: string | null,
): RetainedWorkUnitSelection | null {
    if (!workUnitId) return null;
    return selectionByUnit.get(key(orgId, workUnitId)) ?? null;
}

export function putRetainedWorkView(orgId: string | null, workUnitId: string | null, workViewId: string): void {
    if (!workUnitId || !workViewId) return;
    selectedWorkViewByUnit.set(key(orgId, workUnitId), workViewId);
}

export function peekRetainedWorkView(orgId: string | null, workUnitId: string | null): string | null {
    if (!workUnitId) return null;
    return selectedWorkViewByUnit.get(key(orgId, workUnitId)) ?? null;
}

export function clearRetainedWorkView(orgId: string | null, workUnitId: string | null): void {
    selectedWorkViewByUnit.delete(key(orgId, workUnitId));
}

/** Clear all retained operator context — used on org change / logout alongside the session cache. */
export function clearRetainedOperatorContext(): void {
    selectedWorkViewByUnit.clear();
    selectionByUnit.clear();
}
