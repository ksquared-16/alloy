"use client";

import type { DrawerRuntimeDebugInfo } from "@/lib/adminV2/drawer/drawerRuntimeDebug";
import { formatDrawerRuntimeDebugLine } from "@/lib/adminV2/drawer/drawerRuntimeDebug";

type Props = DrawerRuntimeDebugInfo;

/**
 * Visible in-drawer proof of which runtime path rendered (dev or NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG).
 */
export default function DrawerRuntimeDebugBadge(props: Props) {
    const line = formatDrawerRuntimeDebugLine(props);

    return (
        <div
            className="pointer-events-none absolute right-3 top-2 z-[30] max-w-[min(100%,28rem)] rounded border border-amber-400/80 bg-amber-100 px-2 py-1 text-[10px] font-mono leading-snug text-amber-950 shadow-sm"
            data-drawer-runtime-debug-badge="true"
            data-drawer-debug-route={props.route}
            data-drawer-debug-surface={props.surface}
            data-drawer-debug-source={props.source}
            data-drawer-debug-status-component={props.statusComponent}
            title={line}
        >
            <span className="font-semibold">Drawer Debug:</span> {line}
        </div>
    );
}
