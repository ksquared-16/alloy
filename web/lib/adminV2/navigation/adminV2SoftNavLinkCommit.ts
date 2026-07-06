import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { runAdminV2NavigationTransition } from "@/lib/adminV2/navigation/adminV2NavigationTransition";
import { armSoftNavReloadFloor } from "@/lib/adminV2/navigation/adminV2SoftNavReloadFloor";
import {
    adminV2CommitNavigation,
    adminV2OperatorSoftNavEnabled,
    adminV2SoftNavClickedKey,
    isAdminV2SoftNavEligibleHref,
    prepareAdminV2SoftNavTarget,
    resolveAdminV2SoftNavVariant,
    type AdminV2CommitNavigationOpts,
} from "@/lib/adminV2/shellNavigation";

export type AdminV2NavLinkCommitOpts = AdminV2CommitNavigationOpts & {
    router: AppRouterInstance;
};

/**
 * Whether this href takes the soft path (NAV-1 (A) / Surface Host, Phase 2A). Eligible operator
 * Workspace <-> Work Unit paths soft-navigate BY DEFAULT so the shell stays mounted; everything
 * else (settings/workflows/forms) hard-navigates. `…SOFT_SIDEBAR_NAV=0` forces hard everywhere.
 */
export function shouldSoftNavigate(href: string): boolean {
    return isAdminV2SoftNavEligibleHref(href) && adminV2OperatorSoftNavEnabled();
}

/**
 * Shell nav commit — orchestrated SOFT transition for eligible Workspace <-> Work Unit routes
 * (shell stays mounted), else the guaranteed hard document load. On the soft path the reload-floor
 * watchdog recovers via `adminV2CommitNavigation` (`window.location.assign`) if the navigation
 * stalls — so a cancelled/dead soft nav degrades to a reload instead of a stuck frame.
 */
export function commitAdminV2NavLinkNavigation(href: string, opts: AdminV2NavLinkCommitOpts): void {
    if (!shouldSoftNavigate(href)) {
        adminV2CommitNavigation(href, opts);
        return;
    }

    const targetPathname = href.split(/[?#]/)[0] ?? href;

    void runAdminV2NavigationTransition({
        href,
        clickedKey: adminV2SoftNavClickedKey(href),
        variant: resolveAdminV2SoftNavVariant(href),
        prepare: () => prepareAdminV2SoftNavTarget(href),
        commit: () => {
            opts.router.push(href);
            // Reload floor: if the soft nav has not reached the target by the timeout (and was not
            // superseded), recover via the guaranteed hard load — never a stuck soft-nav frame.
            armSoftNavReloadFloor(targetPathname, {
                getPathname: () =>
                    typeof window !== "undefined" ? window.location.pathname : targetPathname,
                reload: () => adminV2CommitNavigation(href, opts),
            });
        },
    });
}
