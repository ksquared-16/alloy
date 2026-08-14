/**
 * Work Unit pill switching — pure decision helpers.
 *
 * Doctrine: a Work View pill on an open Work Unit is a LENS, not a Work Unit change.
 * Pill-strip views always swap queue + Focus in place (Excel tabs) — even when Settlement
 * evaluates a view's COUNT on a different host. Workspace entry (not the pill strip) owns
 * true host changes via `useWorkUnitEntryMovement`.
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
    /** When set, also treat as same-host when the target shares the active view's settled host. */
    currentWorkViewId?: string | null,
): boolean {
    const id = workViewId.trim();
    if (!id) return false;
    const location = canonicalLocationByViewId.get(id);
    if (!location?.workUnitId) return false;
    if (currentWorkUnitId && location.workUnitId === currentWorkUnitId) return true;
    const activeId = currentWorkViewId?.trim() || "";
    if (!activeId) return false;
    const activeHost = canonicalLocationByViewId.get(activeId)?.workUnitId ?? null;
    return Boolean(activeHost && activeHost === location.workUnitId);
}

export function hrefWithWorkViewId(href: string, workViewId: string): string {
    const id = workViewId.trim();
    if (!id || !href.trim()) return href;
    try {
        const u = new URL(href, "http://local");
        u.searchParams.set("work_view_id", id);
        return `${u.pathname}${u.search}${u.hash}`;
    } catch {
        return href;
    }
}

export function resolveSelectWorkViewAction(args: {
    workViewId: string;
    currentWorkViewId: string | null;
    currentWorkUnitId: string | null;
    canonicalLocationByViewId: ReadonlyMap<string, WorkViewCanonicalLocation>;
    targetInputs: WorkViewTargetInputs;
    /**
     * Ids from the committed surface's `lensSet` (the pill strip). A view on this strip is a
     * LENS of the open Work Unit — never a pathname / Work Unit exchange, even when Settlement
     * evaluates its COUNT on a different host work unit.
     */
    surfaceLensIds?: ReadonlyArray<string> | ReadonlySet<string> | null;
}): SelectWorkViewAction {
    const id = args.workViewId.trim();
    if (!id || id === args.currentWorkViewId?.trim()) {
        return { kind: "noop" };
    }

    const onSurfacePillStrip = (() => {
        const ids = args.surfaceLensIds;
        if (!ids) return false;
        if (Array.isArray(ids)) return ids.some((x) => x.trim() === id);
        return ids.has(id);
    })();

    // Pill-strip contract: Work View = lens inside the open Work Unit. Never navigate to
    // `/workspace/work-unit/tours` or `/waitlist` from a pill — that remounts the shell
    // (`[workUnitSlug]` layout + `key={attention.target}`) and is how Tours count=1 / rows=0
    // and "page refresh" appear.
    if (onSurfacePillStrip) {
        return { kind: "in-page", workViewId: id };
    }

    if (
        isSameHostWorkView(
            id,
            args.currentWorkUnitId,
            args.canonicalLocationByViewId,
            args.currentWorkViewId,
        )
    ) {
        return { kind: "in-page", workViewId: id };
    }

    const location = args.canonicalLocationByViewId.get(id) ?? null;
    // Unknown host while already on a Work Unit: NEVER invent a label-slug SURFACE navigation.
    if (!location && args.currentWorkUnitId) {
        return { kind: "in-page", workViewId: id };
    }

    const href = resolveWorkViewTargetHref(id, args.targetInputs);
    if (!href) {
        if (args.currentWorkUnitId) {
            return { kind: "in-page", workViewId: id };
        }
        return { kind: "noop" };
    }

    return { kind: "navigate", workViewId: id, href: hrefWithWorkViewId(href, id) };
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

/** How the Work Unit surface arrived at its selected subject — ordered by canonical precedence. */
export type WorkUnitSelectedSubjectSource =
    | "url"
    | "retained"
    | "retained_out_of_view"
    | "strategy"
    | "first_row"
    | "empty";

/**
 * The subject a populated Work View resolves to, resolved SYNCHRONOUSLY so the surface never commits
 * a coherent reveal with rows present but nothing selected. `selectedRecordId` is non-null whenever
 * `rowRecordIds` is non-empty (compatibility fallback = first row), so `rows.length > 0 && selectedRecordId === null` is an impossible committed state.
 * Exception: `retained_out_of_view` may select a record outside the current row set after a stage move.
 */
export type WorkUnitSelectedSubject = {
    selectedRecordId: string | null;
    source: WorkUnitSelectedSubjectSource;
};

/**
 * Canonical Work Unit selected-subject resolution — the ONE precedence the runtime, the readiness
 * gate, and the auto-open effect share. Doctrine: Work Unit entry resolves a default operational
 * subject and opens the Focus Panel; queue rows are the selection surface, never an unresolved
 * landing state. Precedence:
 *
 *   1. explicit record id in the route (deep link) — unless the operator just force-switched pills
 *      in-page, in which case the stale URL no longer pins the subject;
 *   2. retained valid record for this org + Work Unit + Work View (return-navigation restore) — when
 *      still present in the current rows;
 *   2b. short-lived out-of-view pin after a stage move — keep Focus Panel on the same record without
 *      auto-navigating to the destination Work View;
 *   3. configured Default Operational Subject Strategy — NOT YET IMPLEMENTED; when it ships it slots
 *      here (source `"strategy"`), ahead of the first-row fallback;
 *   4. first visible row — the current compatibility fallback for the default operational subject;
 *   5. null — only after an authoritative empty result (`queueSettled` with zero rows). Before the
 *      rows settle the selection is still *pending*, so callers gate the reveal on `queueSettled` and
 *      a pending null never renders as an empty panel.
 */
export function resolveWorkUnitSelectedSubject(args: {
    routeRecordId: string | null;
    rowRecordIds: readonly string[];
    retainedRecordId: string | null;
    /** Short-lived pin after stage movement — may be outside current rows. */
    outOfViewPinnedRecordId?: string | null;
    /** Operator just switched pills in-page — a deep-link URL no longer pins selection. */
    forceAutoOpen: boolean;
    /** Rows have settled at least once — distinguishes authoritative empty from pending. */
    queueSettled: boolean;
}): WorkUnitSelectedSubject {
    const routeRecordId = args.routeRecordId?.trim() || null;
    if (routeRecordId && !args.forceAutoOpen) {
        return { selectedRecordId: routeRecordId, source: "url" };
    }

    const retained = args.retainedRecordId?.trim() || null;
    if (retained && args.rowRecordIds.includes(retained)) {
        return { selectedRecordId: retained, source: "retained" };
    }

    const pinned = args.outOfViewPinnedRecordId?.trim() || null;
    if (pinned) {
        return { selectedRecordId: pinned, source: "retained_out_of_view" };
    }

    // 3. Default Operational Subject Strategy — reserved; not yet implemented (first_row is the
    //    documented compatibility fallback until it ships).

    if (args.rowRecordIds.length > 0) {
        return { selectedRecordId: args.rowRecordIds[0]!, source: "first_row" };
    }

    return { selectedRecordId: null, source: "empty" };
}
