/**
 * Work Unit pill switching — pure decision helpers.
 *
 * Same-host views swap queue rows + focus panel in place (Excel tabs).
 * Cross-host views still navigate; Surface Hold minimizes shell remount.
 */

import { resolveWorkViewTargetHref, type WorkViewTargetInputs } from "@/lib/presentation/runtime/workViewTargetHref";
import type { WorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";

export type SelectWorkViewAction =
    | { kind: "noop" }
    | { kind: "in-page"; workViewId: string }
    | { kind: "navigate"; workViewId: string; href: string };

/** True when the view's canonical host is the current work unit (in-page tab switch). */
export function isSameHostWorkView(
    workViewId: string,
    currentWorkUnitId: string | null,
    canonicalLocationByViewId: ReadonlyMap<string, WorkViewCanonicalLocation>,
): boolean {
    const id = workViewId.trim();
    if (!id || !currentWorkUnitId) return false;
    const location = canonicalLocationByViewId.get(id);
    return location?.workUnitId === currentWorkUnitId;
}

export function resolveSelectWorkViewAction(args: {
    workViewId: string;
    currentWorkViewId: string | null;
    currentWorkUnitId: string | null;
    canonicalLocationByViewId: ReadonlyMap<string, WorkViewCanonicalLocation>;
    targetInputs: WorkViewTargetInputs;
}): SelectWorkViewAction {
    const id = args.workViewId.trim();
    if (!id || id === args.currentWorkViewId?.trim()) {
        return { kind: "noop" };
    }

    if (
        isSameHostWorkView(id, args.currentWorkUnitId, args.canonicalLocationByViewId)
    ) {
        return { kind: "in-page", workViewId: id };
    }

    const href = resolveWorkViewTargetHref(id, args.targetInputs);
    if (!href) {
        // Label-less / unresolvable cross-host edge — fall back to in-page if we're already here.
        if (args.currentWorkUnitId) {
            return { kind: "in-page", workViewId: id };
        }
        return { kind: "noop" };
    }

    return { kind: "navigate", workViewId: id, href };
}

/** Whether to auto-open the first queue row after a view's rows settle. */
export function shouldAutoOpenFirstRowForView(args: {
    viewId: string | null;
    autoOpenedViewId: string | null;
    queueLoading: boolean;
    queueSettled: boolean;
    rowCount: number;
    routeRecordId: string | null;
    /** Set when operator just switched pills in-page — overrides deep-link guard. */
    forceAutoOpenViewId: string | null;
}): boolean {
    const viewId = args.viewId?.trim() || null;
    if (!viewId || args.autoOpenedViewId === viewId) return false;
    if (args.queueLoading || !args.queueSettled) return false;
    if (args.rowCount <= 0) return false;
    if (args.routeRecordId && args.forceAutoOpenViewId !== viewId) return false;
    return true;
}

/**
 * Resolve WHICH record the auto-open should select, given the settled rows and the operator's
 * retained selection. Precedence (a URL record id is handled upstream by
 * `shouldAutoOpenFirstRowForView`, which suppresses auto-open when a deep-link record is present):
 *
 *   1. retained selected record — only when it is still present in the current rows;
 *   2. the first current row;
 *   3. null — only when there are no rows (genuinely empty).
 *
 * A stale retained record no longer in the view is ignored (falls through to the first row), so a
 * mutation that removes the selected row lands on the next valid row rather than a blank panel.
 */
export function resolveAutoOpenRecordId(
    rowRecordIds: readonly string[],
    retainedRecordId: string | null,
): string | null {
    if (rowRecordIds.length === 0) return null;
    const retained = retainedRecordId?.trim() || null;
    if (retained && rowRecordIds.includes(retained)) return retained;
    return rowRecordIds[0] ?? null;
}
