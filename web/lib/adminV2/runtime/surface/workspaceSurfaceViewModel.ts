/**
 * WorkspaceSurfaceViewModel — client adapter over the existing /workspace loader + session cache +
 * reveal gate. Owns the single above-fold commit for `/workspace`; components present its sections.
 *
 * `reveal.canCommit` is the authoritative `workspaceRevealGate.above_fold_ready` — this adapter does
 * not introduce a second gate. The blocking bundle (WS-02 header + WS-05 process tiles) and the
 * snapshot/non-blocking sections (WS-01 resume, WS-03 health, WS-04 pulse, WS-06 tile KPI, WS-07
 * right rail) mirror `alloySectionMap`. KPI/count values patch after commit.
 */

import type { WorkspaceRevealGate } from "@/lib/adminV2/workspaceRevealGate";
import {
    composeSurfaceReveal,
    resolveSurfaceSource,
    type SurfaceViewModel,
} from "@/lib/adminV2/runtime/surface/surfaceViewModel";

export type WorkspaceSurfaceSections = {
    /** WS-02 */
    header: { orgName: string | null };
    /** WS-03 — snapshot/default slot (values patch after commit) */
    healthKpi: { hasSnapshot: boolean };
    /** WS-04 — snapshot/default slot (values patch after commit) */
    operationalPulse: { hasSnapshot: boolean };
    /** WS-05 — business process tiles (blocking) */
    processTiles: { count: number };
    /** WS-06 — per-tile KPI snapshot/default slot (values patch after commit) */
    tileKpi: { hasSnapshot: boolean };
    /** WS-01 — resume chip metadata (non-blocking) */
    resume: { available: boolean };
    /** WS-07 — right rail shell metadata if available (non-blocking) */
    rightRail: { available: boolean };
};

export type WorkspaceSurfaceViewModel = SurfaceViewModel<WorkspaceSurfaceSections>;

const WORKSPACE_SURFACE_VM_VERSION = 1;

/** Sections whose values may change in place after the surface commits. */
export const WORKSPACE_PATCH_AFTER_COMMIT = ["WS-01", "WS-03", "WS-04", "WS-06", "WS-07"] as const;

export type ComposeWorkspaceSurfaceInput = {
    /** Authoritative existing reveal gate — drives `reveal.canCommit`. */
    gate: WorkspaceRevealGate;
    orgName: string | null;
    healthSnapshotAvailable: boolean;
    operationalPulseSnapshotAvailable: boolean;
    processTileCount: number;
    tileKpiSnapshotAvailable: boolean;
    resumeAvailable: boolean;
    rightRailAvailable: boolean;
    /** Root session cache hit (`workspaceCachePrimed`). */
    warmFromCache: boolean;
    /** Lifecycle tiles restored synchronously from the module/session snapshot. */
    warmFromSession: boolean;
};

export function composeWorkspaceSurfaceViewModel(
    input: ComposeWorkspaceSurfaceInput,
): WorkspaceSurfaceViewModel {
    const { source, warm } = resolveSurfaceSource({
        seededFromSession: input.warmFromSession,
        seededFromCache: input.warmFromCache,
        network: !input.warmFromSession && !input.warmFromCache,
    });

    const reveal = composeSurfaceReveal({
        canCommit: input.gate.above_fold_ready,
        sections: [
            { id: "WS-01", blocking: false },
            { id: "WS-02", blocking: true },
            { id: "WS-03", blocking: false },
            { id: "WS-04", blocking: false },
            { id: "WS-05", blocking: true },
            { id: "WS-06", blocking: false },
            { id: "WS-07", blocking: false },
        ],
    });

    return {
        id: "surface:workspace",
        surface: "workspace",
        version: WORKSPACE_SURFACE_VM_VERSION,
        ready: input.gate.above_fold_ready,
        warm,
        source,
        sections: {
            header: { orgName: input.orgName },
            healthKpi: { hasSnapshot: input.healthSnapshotAvailable },
            operationalPulse: { hasSnapshot: input.operationalPulseSnapshotAvailable },
            processTiles: { count: input.processTileCount },
            tileKpi: { hasSnapshot: input.tileKpiSnapshotAvailable },
            resume: { available: input.resumeAvailable },
            rightRail: { available: input.rightRailAvailable },
        },
        reveal,
        patch: { allowedAfterCommit: [...WORKSPACE_PATCH_AFTER_COMMIT] },
    };
}
