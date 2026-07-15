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

// ── Retained scroll continuity (Workspace / Queue / Focus Panel) ─────────────────────────────────
// Operator scroll position is in-surface continuity, same class as the retained selection: it is not
// in the URL, so an unmount would lose it. Kept per session, scoped so that returning to the SAME
// surface restores the operator's place, while a DIFFERENT surface (other view / other record / other
// site) starts at the top. Scroll restore is a hint only — the browser clamps it to current content
// height, so a shorter list after a mutation/permission change simply lands at the bottom, never an
// invalid offset. Cleared wholesale on org change / logout via clearRetainedOperatorContext.
const scrollByScope = new Map<string, number>();

/** Queue scroll is per (org, work unit, work view) so Work View A→B→A restores each view's place. */
export function queueScrollScope(
    orgId: string | null,
    workUnitId: string | null,
    workViewId: string | null,
): string {
    return `queue:${orgId ?? "_"}:${workUnitId ?? "_"}:${workViewId ?? "_"}`;
}

/** Focus Panel scroll is per (org, record) — it belongs to the specific record on screen (ids unique). */
export function focusPanelScrollScope(orgId: string | null, recordId: string | null): string {
    return `focus:${orgId ?? "_"}:${recordId ?? "_"}`;
}

/** Workspace scroll is per (org, site scope) — the process-overview surface. */
export function workspaceScrollScope(orgId: string | null, siteScopeId: string | null): string {
    return `workspace:${orgId ?? "_"}:${siteScopeId ?? "_"}`;
}

export function putRetainedScroll(scope: string, top: number): void {
    if (!Number.isFinite(top) || top < 0) return;
    scrollByScope.set(scope, Math.round(top));
}

export function peekRetainedScroll(scope: string): number | null {
    return scrollByScope.get(scope) ?? null;
}

/** Clear all retained operator context — used on org change / logout alongside the session cache. */
export function clearRetainedOperatorContext(): void {
    selectedWorkViewByUnit.clear();
    selectionByUnit.clear();
    scrollByScope.clear();
}
