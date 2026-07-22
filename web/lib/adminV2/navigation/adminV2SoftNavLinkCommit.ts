import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { runAdminV2NavigationTransition } from "@/lib/adminV2/navigation/adminV2NavigationTransition";
import { armSoftNavReloadFloor } from "@/lib/adminV2/navigation/adminV2SoftNavReloadFloor";
import {
    adminV2CommitNavigation,
    adminV2OperatorSoftNavEnabled,
    adminV2SoftNavClickedKey,
    adminV2SoftNavShouldCommitFirst,
    isAdminV2SoftNavEligibleHref,
    prepareAdminV2SoftNavTarget,
    resolveAdminV2SoftNavVariant,
    type AdminV2CommitNavigationOpts,
} from "@/lib/adminV2/shellNavigation";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";

export type AdminV2NavLinkCommitOpts = AdminV2CommitNavigationOpts & {
    router: AppRouterInstance;
};

/**
 * Whether this href takes the soft path. Eligible by default:
 * - Operator Workspace <-> Work Unit (NAV-1 / Surface Host)
 * - Organization / Settings Configuration Continuity (Checkpoint A)
 *
 * Workflows / forms hard-navigate. `…SOFT_SIDEBAR_NAV=0` forces hard everywhere.
 */
export function shouldSoftNavigate(href: string): boolean {
    return isAdminV2SoftNavEligibleHref(href) && adminV2OperatorSoftNavEnabled();
}

/**
 * Shell nav commit — orchestrated SOFT transition for eligible routes (shell stays mounted),
 * else the guaranteed hard document load. On the soft path the reload-floor watchdog recovers
 * via `adminV2CommitNavigation` (`window.location.assign`) if the navigation stalls.
 *
 * Configuration Continuity uses commit-first so Organization navigation acknowledges immediately;
 * Work Unit paths still prepare provisioning before commit unless commit-first applies.
 */
export function commitAdminV2NavLinkNavigation(href: string, opts: AdminV2NavLinkCommitOpts): void {
    if (!shouldSoftNavigate(href)) {
        adminV2CommitNavigation(href, opts);
        return;
    }

    const targetPathname = href.split(/[?#]/)[0] ?? href;
    const commitFirst = adminV2SoftNavShouldCommitFirst(href);

    void runAdminV2NavigationTransition({
        href,
        clickedKey: adminV2SoftNavClickedKey(href),
        variant: resolveAdminV2SoftNavVariant(href),
        commitFirst,
        prepare: () => {
            if (commitFirst) {
                return prepareConfigurationSoftNavTarget(href, (h) => opts.router.prefetch(h));
            }
            return prepareAdminV2SoftNavTarget(href);
        },
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
