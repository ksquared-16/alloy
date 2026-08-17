"use client";

/**
 * `?workspace=…&section=…` → open that workspace modal, once.
 *
 * Workspace modals are shell state, not routes, so a link from outside the shell has had no way to
 * name one. The people surfaces need it: `/organization/staff` must keep working for old bookmarks,
 * and its only honest destination is Roster → Staff.
 *
 * ── WHY THIS IS EXPLICIT AND NARROW ──
 *
 * It reads ONE parameter, dispatches through the existing coordinator, and strips the parameter so a
 * reload or a back-navigation does not re-open a workspace the operator has since closed. It adds no
 * behaviour to any surface that does not carry the parameter, which is what keeps it from becoming a
 * second, ambient way for the URL to drive shell state.
 *
 * Unknown values are IGNORED rather than defaulted — opening some other workspace because a link was
 * stale would answer a question nobody asked.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { dispatchAdminV2OpenRosterModal } from "@/lib/adminV2/workspaceModalEvents";
import { resolveOperationsWorkSection as resolveRosterSection } from "@/app/adminV2/operations/operationsSections";

export default function WorkspaceModalDeepLink() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    /** The intent is consumed exactly once per mount, whatever re-renders happen after. */
    const consumed = useRef(false);

    useEffect(() => {
        if (consumed.current) return;
        const workspace = (params.get("workspace") ?? "").trim().toLowerCase();
        if (!workspace) return;
        consumed.current = true;

        // `records` is kept as an ACCEPTED value, not a live workspace. Staff and Children moved
        // under Roster, and every link ever written to Records — `/organization/staff`, an operator
        // bookmark, a stored deep link — has to keep landing on the same two sections. Dropping the
        // value would turn those into silent no-ops, which is the worst outcome available: the link
        // still resolves, the page still loads, and nothing opens.
        if (workspace === "records" || workspace === "roster") {
            const section = resolveRosterSection(params.get("section"));
            dispatchAdminV2OpenRosterModal(section ? { section } : undefined);
        }

        // ⚠ The strip is DEFERRED, and that is load-bearing.
        //
        // `router.replace` re-renders the workspace tree. Run in the same tick as the dispatch, it
        // raced the modal coordinator's own commit and the workspace intermittently came up closed —
        // the link "worked" most of the time, which is the worst kind of broken. Letting the open
        // commit first makes the order explicit instead of accidental.
        //
        // The strip itself matters: the parameter has been consumed, and leaving it would re-open the
        // workspace on every back-navigation, after the operator closed it.
        const timer = setTimeout(() => {
            const next = new URLSearchParams(params.toString());
            next.delete("workspace");
            next.delete("section");
            const qs = next.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }, 0);
        return () => clearTimeout(timer);
    }, [params, router, pathname]);

    return null;
}
