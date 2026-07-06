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
