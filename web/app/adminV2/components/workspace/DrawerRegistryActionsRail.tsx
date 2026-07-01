"use client";

import { CommandRailExecutableActionList } from "@/app/adminV2/components/workspace/CommandRailExecutableActionList";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    canMutate: boolean;
    actionLoadingKey?: string | null;
    disabledReason?: string | null;
    onActionSelect: (action: ResolvedActionForClient) => void;
};

/**
 * Drawer registry actions as executable rail rows (replaces header Actions menu when BOS copilot is on).
 */
export function DrawerRegistryActionsRail({
    actions,
    canMutate,
    actionLoadingKey = null,
    disabledReason = null,
    onActionSelect,
}: Props) {
    const disabled = !canMutate || !!actionLoadingKey;

    if (actions.length === 0) {
        return (
            <p className="px-1 text-[11px] leading-snug text-[rgba(39,63,82,0.62)]" data-drawer-rail-actions-empty="true">
                {disabledReason ?? "No actions available for this record."}
            </p>
        );
    }

    return (
        <CommandRailExecutableActionList
            actions={actions.map((action) => {
                const busy = actionLoadingKey === action.key;
                const itemDisabled = disabled || busy;
                return {
                    id: action.key,
                    label: action.label,
                    disabled: itemDisabled,
                    busy,
                    onClick: () => {
                        if (itemDisabled) return;
                        onActionSelect(action);
                    },
                };
            })}
        />
    );
}
