import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { runAdminV2NavigationTransition } from "@/lib/adminV2/navigation/adminV2NavigationTransition";
import {
    adminV2CommitNavigation,
    adminV2SoftNavClickedKey,
    adminV2SoftSidebarNavEnabled,
    isAdminV2SoftNavEligibleHref,
    prepareAdminV2SoftNavTarget,
    resolveAdminV2SoftNavVariant,
    type AdminV2CommitNavigationOpts,
} from "@/lib/adminV2/shellNavigation";

export type AdminV2NavLinkCommitOpts = AdminV2CommitNavigationOpts & {
    router: AppRouterInstance;
};

/**
 * Shell nav commit — soft orchestrated transition for eligible workspace routes when flag is on;
 * otherwise guaranteed hard navigation.
 */
export function commitAdminV2NavLinkNavigation(href: string, opts: AdminV2NavLinkCommitOpts): void {
    const useSoftNav = adminV2SoftSidebarNavEnabled() && isAdminV2SoftNavEligibleHref(href);
    if (!useSoftNav) {
        adminV2CommitNavigation(href, opts);
        return;
    }

    void runAdminV2NavigationTransition({
        href,
        clickedKey: adminV2SoftNavClickedKey(href),
        variant: resolveAdminV2SoftNavVariant(href),
        prepare: () => prepareAdminV2SoftNavTarget(href),
        commit: () => {
            opts.router.push(href);
        },
    });
}
