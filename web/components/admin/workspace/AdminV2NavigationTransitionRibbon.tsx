"use client";

import { WsRouteLoadingRibbon } from "@/components/admin/workspace/workspaceRouteSkeletons";
import { useAdminV2NavigationTransition } from "@/lib/adminV2/navigation";

/**
 * Shell-level transition ribbon — overlays current page during orchestrated nav (idle: renders null).
 */
export function AdminV2NavigationTransitionRibbon() {
    const transition = useAdminV2NavigationTransition();
    if (!transition.isTransitioning) return null;
    return (
        <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[15] flex justify-center px-4"
            aria-live="polite"
            data-adminv2-nav-transition-ribbon
        >
            <div className="w-full max-w-[min(100%,1520px)]">
                <WsRouteLoadingRibbon label={transition.ribbonLabel ?? "Loading"} />
            </div>
        </div>
    );
}
