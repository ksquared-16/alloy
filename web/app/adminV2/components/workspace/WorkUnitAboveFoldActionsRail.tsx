"use client";

import ActionsBlock from "@/app/adminV2/components/workspace/blocks/ActionsBlock";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import type { WorkUnitAboveFoldActionsRailSlot } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { countActionsVm } from "@/lib/bos/countActionsVm";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
    slot: WorkUnitAboveFoldActionsRailSlot;
    onAction: WorkspaceActionHandler;
};

/**
 * Actions rail — same shell from first paint; skeleton buttons hydrate to ActionsBlock in place.
 */
export function WorkUnitAboveFoldActionsRail({ slot, onAction }: Props) {
    if (!slot.visible) return null;

    const actionCount =
        slot.state === "ready" ? countActionsVm(slot.actions_rail, "work_unit") : null;

    return (
        <CommandRailCollapsibleActionsSection
            actionCount={actionCount}
            loading={slot.state === "skeleton"}
        >
            <section
                className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-command-section--primary"
                data-wu-above-fold-slot="actions_rail"
                data-wu-above-fold-state={slot.state}
                aria-busy={slot.state === "skeleton"}
                aria-label="Actions"
            >
                {slot.state === "skeleton" ?
                    <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column gap-2">
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/18" />
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-full rounded-md bg-alloy-stone/16" />
                        <div className="adminv2-ws-rail-ph-btn adminv2-shimmer-bar h-9 w-[92%] rounded-md bg-alloy-stone/14" />
                    </div>
                :   <ActionsBlock
                        model={slot.actions_rail}
                        onAction={onAction}
                        title="Actions"
                        surface="work_unit"
                        suppressSectionTitles
                    />
                }
            </section>
        </CommandRailCollapsibleActionsSection>
    );
}
