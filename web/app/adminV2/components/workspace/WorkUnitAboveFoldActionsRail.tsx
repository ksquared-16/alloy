"use client";

import { WorkspaceCommandRailActionsSection } from "@/app/adminV2/components/workspace/WorkspaceCommandRailActionsSection";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import type { WorkUnitAboveFoldActionsRailSlot } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { countActionsVm } from "@/lib/bos/countActionsVm";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
    slot: WorkUnitAboveFoldActionsRailSlot;
    onAction: WorkspaceActionHandler;
};

/** Actions rail — same shell from first paint; skeleton buttons hydrate to ActionsBlock in place. */
export function WorkUnitAboveFoldActionsRail({ slot, onAction }: Props) {
    if (!slot.visible) {
        return (
            <CommandRailCollapsibleActionsSection actionCount={0} loading={slot.state === "skeleton"}>
                {slot.state === "skeleton" ?
                    <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column gap-2 px-2 pb-2">
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/18" />
                    </div>
                :   <p className="px-2 pb-2 text-[11px] text-alloy-midnight/45">No actions in this context.</p>
                }
            </CommandRailCollapsibleActionsSection>
        );
    }

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
