"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installAdminV2ClickDebug } from "@/lib/debug/adminV2ClickDebug";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";

/** Dev-only capture-phase click logger (localStorage `alloy_click_debug=1`). */
export default function AdminV2ClickDebugInstaller() {
    const pathname = usePathname();
    const drawerCtx = useAdminDrawerOptional();

    useEffect(() => {
        return installAdminV2ClickDebug({
            getDrawerState: () => ({
                open: Boolean(drawerCtx?.drawer.type && drawerCtx.drawer.id),
                type: drawerCtx?.drawer.type ?? null,
                id: drawerCtx?.drawer.id ?? null,
            }),
        });
    }, [pathname, drawerCtx?.drawer.type, drawerCtx?.drawer.id]);

    return null;
}
