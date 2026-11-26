/**
 * Command-workspace width preset — extends BosPresentationController geometry only.
 * No second sizing state machine.
 */

import {
    BOS_FLOAT_MIN_WIDTH_PX,
    clampBosFloatingGeometry,
    type BosCanvasBounds,
    type BosFloatingGeometry,
} from "@/lib/bos/bosFloatingGeometry";

/** Floating width floor when Form / Review need a calmer command workspace. */
export const BOS_COMMAND_WORKSPACE_MIN_WIDTH_PX = 520;

export type CommandWorkspaceWidthSnapshot = {
    priorWidth: number;
    bumped: boolean;
};

export function shouldBumpToCommandWorkspace(width: number): boolean {
    return width < BOS_COMMAND_WORKSPACE_MIN_WIDTH_PX;
}

export function bumpFloatingToCommandWorkspace(
    geo: BosFloatingGeometry,
    canvas: BosCanvasBounds
): { next: BosFloatingGeometry; snapshot: CommandWorkspaceWidthSnapshot } {
    const priorWidth = geo.width;
    if (!shouldBumpToCommandWorkspace(priorWidth)) {
        return { next: geo, snapshot: { priorWidth, bumped: false } };
    }
    const next = clampBosFloatingGeometry(
        { ...geo, width: Math.max(priorWidth, BOS_COMMAND_WORKSPACE_MIN_WIDTH_PX) },
        canvas
    );
    return {
        next,
        snapshot: { priorWidth, bumped: next.width !== priorWidth },
    };
}

export function restoreFloatingWidth(
    geo: BosFloatingGeometry,
    snapshot: CommandWorkspaceWidthSnapshot | null,
    canvas: BosCanvasBounds
): BosFloatingGeometry {
    if (!snapshot?.bumped) return geo;
    return clampBosFloatingGeometry(
        {
            ...geo,
            width: Math.max(BOS_FLOAT_MIN_WIDTH_PX, snapshot.priorWidth),
        },
        canvas
    );
}
