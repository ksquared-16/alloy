/**
 * Session-retained operator context per Work Unit (Trust Closure §9). The operator's in-surface
 * selections — currently the selected Work View — do not live in the URL (same-host pill switches
 * are in-page), so a surface unmount would lose them. This module holds them for the authenticated
 * session (SPA lifetime), scoped by org + work unit, so a return restores the operator's place.
 *
 * Only SAFE, non-authoritative UI selection is retained here. Explicitly NOT retained: an open
 * record / Focus Panel (the URL owns that; a stale record is not resurrected), partially-composed
 * mutation forms, destructive confirmation state, or transient errors.
 */

const selectedWorkViewByUnit = new Map<string, string>();

function key(orgId: string | null, workUnitId: string | null): string {
    return `${orgId ?? "_"}:${workUnitId ?? "_"}`;
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
}
