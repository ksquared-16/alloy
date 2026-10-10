/**
 * E2E-02 — OPEN LEAD IS AN ATTENTION MOVEMENT, NOT A NAVIGATION.
 *
 * Human QA: Create Lead succeeded, Open Lead "did nothing", and a refresh showed the family. Measured
 * on deployed staging: the click changed the address to
 * `/workspace/work-unit/new?work_view_id=new_leads&subject_id=<opp>` and the surface stayed blank.
 *
 * BOS renders in the shell chrome — inside the workspace layout, above the Runtime Kernel. From there
 * `router.push` to a work-unit route is the failure `operatorFocusSelection.ts` and
 * `useOperatorRecordFocus` already document: the route is seed-only, the layout does not remount,
 * nothing re-reads the URL, and the surface goes blank with no error. A refresh is a cold load, which
 * is the one moment a URL may establish attention — hence "refresh shows it".
 *
 * So the address `resolveOpenLeadFocusPanelHref` resolves (unchanged: the Work View the server put the
 * new record in, else the work unit's) is opened the way every other producer above the kernel opens
 * a record — Global Search, the right rail — by stating the focus intent for
 * `OperatorFocusAttentionListener` to perform. Outside the workspace layout a push IS a genuine cold
 * entry, and stays a push.
 */

import { CANONICAL_OPERATOR_BASE } from "@/lib/admin/canonicalAdminRoutes";
import { dispatchOperatorFocusSelection } from "@/lib/runtime/focus/operatorFocusSelection";

const WORK_UNIT_ROUTE = /\/work-unit\/([^/?#]+)/;

export type OpenCreatedLeadResult = "focus_selection" | "push" | "none";

export function openCreatedLead(args: {
    /** The canonical address from `resolveOpenLeadFocusPanelHref`. */
    href: string | null | undefined;
    opportunityId: string | null | undefined;
    /** Where the operator stands now (`usePathname()` / `location.pathname`). */
    pathname: string | null | undefined;
    push: (href: string) => void;
}): OpenCreatedLeadResult {
    const href = (args.href ?? "").trim();
    const opportunityId = (args.opportunityId ?? "").trim();
    if (!href) return "none";

    const path = (args.pathname ?? "").trim();
    const insideWorkspace = path === CANONICAL_OPERATOR_BASE || path.startsWith(`${CANONICAL_OPERATOR_BASE}/`);
    const url = new URL(href, "https://alloy.invalid");
    const slug = decodeURIComponent(url.pathname.match(WORK_UNIT_ROUTE)?.[1] ?? "");

    if (insideWorkspace && opportunityId && slug) {
        const workViewId = (url.searchParams.get("work_view_id") ?? "").trim();
        dispatchOperatorFocusSelection({
            entity_type: "opportunities",
            entity_id: opportunityId,
            // The lens the server placed the new record in; the listener prefers it over the unit.
            host_work_view_id: workViewId || null,
            host_work_unit_key: workViewId ? null : slug,
        });
        return "focus_selection";
    }

    args.push(href);
    return "push";
}
