"use client";

import { WorkspaceCommandRailActionsSection } from "@/app/adminV2/components/workspace/WorkspaceCommandRailActionsSection";
import type { WorkUnitAboveFoldActionsRailSlot } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { countActionsVm } from "@/lib/bos/countActionsVm";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
    slot: WorkUnitAboveFoldActionsRailSlot;
    onAction: WorkspaceActionHandler;
};

/** Actions rail — same shell from first paint; skeleton buttons hydrate to ActionsBlock in place. */
export function WorkUnitAboveFoldActionsRail({ slot, onAction }: Props) {
    if (!slot.visible) return null;

    const actionCount =
        slot.state === "ready" ? countActionsVm(slot.actions_rail, "work_unit") : null;

    return (
        <WorkspaceCommandRailActionsSection
            model={slot.actions_rail}
            onAction={onAction}
            surface="work_unit"
            actionCount={actionCount}
            loading={slot.state === "skeleton"}
            slotTestId="wu-above-fold-actions-rail"
            slotState={slot.state}
        />
    );
}
