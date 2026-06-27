/**
 * ShellNavigationSurfaceViewModel — client adapter over the existing persistent left nav.
 *
 * The Alloy OS sidebar is mounted ABOVE the route (in `AdminV2Shell`), so it commits once and stays
 * mounted across `/workspace` ↔ `/workspace/work-unit/:slug` transitions — it must never remount or
 * restage on navigation. This VM formalizes that ownership: nav items + active route + modal
 * launchers + count slots compose one stable surface; count badges patch quietly in place from their
 * warm caches (`useInboxUnreadNavCount` sessionStorage, `useOperationalTasksNavCounts` in-memory TTL)
 * and must not cause late layout shift.
 *
 * Nav section ids are local (`NAV-*`) — the nav is the persistent shell (WS-00/WU-00), not a
 * per-surface above-fold section in `alloySectionMap`.
 */

import {
    composeSurfaceReveal,
    resolveSurfaceSource,
    type SurfaceViewModel,
} from "@/lib/adminV2/runtime/surface/surfaceViewModel";

export type ShellNavigationSurfaceSections = {
    /** NAV-ITEMS — standing nav item list (home, modal launchers, settings, lifecycle tree). */
    items: { count: number };
    /** NAV-ACTIVE — resolved active route / nav item. */
    activeRoute: { key: string | null; resolvable: boolean };
    /** NAV-COUNTS — snapshot/default count slots; values patch quietly after commit. */
    counts: {
        inboxUnread: number | null;
        workItems: number | null;
        processing: number | null;
        notifications: number | null;
    };
    /** NAV-LAUNCHERS — registered module/workspace modal launchers. */
    modalLaunchers: { keys: string[] };
    /** NAV-COLLAPSE — pinned/collapsed rail state. */
    collapse: { collapsed: boolean };
};

export type ShellNavigationSurfaceViewModel = SurfaceViewModel<ShellNavigationSurfaceSections>;

const SHELL_NAV_SURFACE_VM_VERSION = 1;

/** Count badges may change in place after the nav commits (must not shift layout). */
export const SHELL_NAV_PATCH_AFTER_COMMIT = ["NAV-COUNTS"] as const;

export type ComposeShellNavigationSurfaceInput = {
    itemCount: number;
    activeRouteKey: string | null;
    activeRouteResolvable: boolean;
    launcherKeys: string[];
    inboxUnread: number | null;
    workItems: number | null;
    processing: number | null;
    notifications: number | null;
    collapsed: boolean;
    /** Items/counts restored from a warm cache (sessionStorage / in-memory). */
    warmFromSession: boolean;
};

export function composeShellNavigationSurfaceViewModel(
    input: ComposeShellNavigationSurfaceInput,
): ShellNavigationSurfaceViewModel {
    const { source, warm } = resolveSurfaceSource({
        seededFromSession: input.warmFromSession,
        network: !input.warmFromSession,
    });

    // Nav readiness: item list exists, active route resolvable, launchers registered. Count slots
    // always satisfy their snapshot/default contract (null → no badge), so they never block.
    const canCommit =
        input.itemCount > 0 && input.activeRouteResolvable && input.launcherKeys.length > 0;

    const reveal = composeSurfaceReveal({
        canCommit,
        sections: [
            { id: "NAV-ITEMS", blocking: true },
            { id: "NAV-ACTIVE", blocking: true },
            { id: "NAV-LAUNCHERS", blocking: true },
            { id: "NAV-COLLAPSE", blocking: true },
            { id: "NAV-COUNTS", blocking: false },
        ],
    });

    return {
        id: "surface:shell_nav",
        surface: "shell_nav",
        version: SHELL_NAV_SURFACE_VM_VERSION,
        ready: canCommit,
        warm,
        source,
        sections: {
            items: { count: input.itemCount },
            activeRoute: { key: input.activeRouteKey, resolvable: input.activeRouteResolvable },
            counts: {
                inboxUnread: input.inboxUnread,
                workItems: input.workItems,
                processing: input.processing,
                notifications: input.notifications,
            },
            modalLaunchers: { keys: input.launcherKeys },
            collapse: { collapsed: input.collapsed },
        },
        reveal,
        patch: { allowedAfterCommit: [...SHELL_NAV_PATCH_AFTER_COMMIT] },
    };
}
