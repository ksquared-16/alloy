import type { ProcessTileModel } from "@/lib/presentation/runtime/types";
import type { WorkspaceProcessSurfaceConfig } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

export type WorkspaceProcessTileSnapshot = {
    processes: ProcessTileModel[];
    config: WorkspaceProcessSurfaceConfig;
};

export type WorkspaceProcessSurfaceReadiness = {
    cardsSettled: boolean;
    configLoaded: boolean;
    signalsSettled: boolean;
    totalsSettled: boolean;
};

export function workspaceProcessSurfaceReady(state: WorkspaceProcessSurfaceReadiness): boolean {
    return state.cardsSettled && state.configLoaded && state.signalsSettled && state.totalsSettled;
}

/**
 * Commit the Workspace Process Summary as one surface. If a refresh is in flight and a
 * previous complete snapshot exists, keep it visible rather than partially morphing labels,
 * values, and counts independently.
 */
export function selectWorkspaceProcessTileSnapshot({
    previous,
    next,
    readiness,
}: {
    previous: WorkspaceProcessTileSnapshot | null;
    next: WorkspaceProcessTileSnapshot;
    readiness: WorkspaceProcessSurfaceReadiness;
}): {
    snapshot: WorkspaceProcessTileSnapshot | null;
    ready: boolean;
} {
    if (workspaceProcessSurfaceReady(readiness)) {
        return { snapshot: next, ready: true };
    }
    if (previous) {
        return { snapshot: previous, ready: true };
    }
    return { snapshot: null, ready: false };
}
