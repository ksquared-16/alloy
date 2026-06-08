"use client";

import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    isVmDrawerTransitionHoldingSource,
    resolveDrawerVmRenderDrawer,
    vmPayloadMatchesRenderDrawer,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";

/** Visible VM drawer identity + transition flags for runtime shells. */
export function useDrawerVmRenderContext() {
    const { drawer, drawerVmRender, drawerRuntimePhase } = useAdminDrawer();

    const holdingSource = isVmDrawerTransitionHoldingSource(drawerRuntimePhase);

    return {
        targetDrawer: drawer,
        renderDrawer: drawerVmRender,
        holdingSource,
        payloadMatchesRender: (entityId: string | null | undefined) =>
            vmPayloadMatchesRenderDrawer(entityId, drawerVmRender),
        resolveRenderDrawer: () => resolveDrawerVmRenderDrawer(drawer, drawerRuntimePhase),
    };
}
