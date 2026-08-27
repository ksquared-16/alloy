/**
 * Does this URL projection create a history entry, or rewrite the current one?
 *
 * K3 projects the address after every commit. Projecting with `replaceState` unconditionally — the
 * behaviour this decision replaces — collapses an entire operator session into ONE history entry:
 * measured on a production build, opening a Work Unit from `/workspace` left `history.length`
 * unchanged and overwrote the `/workspace` entry in place (CDP `Page.getNavigationHistory`:
 * `> [1] /workspace` became `> [1] /workspace/work-unit/waitlist`, currentIndex unmoved). Back then
 * leaves the application entirely — a full document load to whatever preceded that single entry —
 * and the popstate adapter's stamped-destination restore (B2) can never run, because there is never
 * a second entry to come back to.
 *
 * The rule is the SURFACE, not the address:
 *
 *   push    — the operator exchanged one surface for another (`/workspace` ⇄ a Work Unit, or one
 *             Work Unit for another). That is a place they can come back FROM, and it is the entry
 *             K3 stamps its canonical destination into.
 *   replace — everything else. Refining the address within the surface the operator is already on
 *             (a subject/row selection, a lens's query, the sticky site filter) must NOT manufacture
 *             an entry: a 17-row queue would otherwise bury `/workspace` under 17 presses of Back.
 *
 * A projection that lands where the browser already is is ALWAYS a replace. That is what keeps
 * `popstate` from pushing: after Back the address is already the restored one, so re-projecting it
 * rewrites that entry (with the freshly committed stamp) instead of pushing a duplicate and
 * destroying the forward entry.
 */
export type HistoryProjectionMode = "push" | "replace";

export function historyProjectionMode(args: {
    /** Path of the URL K3 is projecting (no query). */
    projectedPath: string;
    /** `window.location.pathname` at projection time. */
    currentPath: string;
    /** Path of the previous projection in this document, or null before the first. */
    lastProjectedPath: string | null;
}): HistoryProjectionMode {
    const { projectedPath, currentPath, lastProjectedPath } = args;
    // The browser is already here — nothing to push onto. Covers popstate restoration and the first
    // projection of a cold direct entry, whose entry the document load already created.
    if (projectedPath === currentPath) return "replace";
    // No previous projection in this document: the address is being reconciled with the committed
    // surface (e.g. a slug normalised on cold entry), not exchanged by the operator.
    if (lastProjectedPath === null) return "replace";
    return lastProjectedPath === projectedPath ? "replace" : "push";
}
