"use client";

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

type Props = {
    actions: ResolvedActionForClient[];
    canMutate: boolean;
    actionLoadingKey?: string | null;
    disabledReason?: string | null;
    onActionSelect: (action: ResolvedActionForClient) => void;
};

/**
 * Drawer registry actions as rail buttons (replaces header Actions menu when BOS copilot is on).
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
        <ul
            className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column flex flex-col gap-1.5"
            data-drawer-rail-actions-list="true"
        >
            {actions.map((action) => {
                const busy = actionLoadingKey === action.key;
                const itemDisabled = disabled || busy;
                return (
                    <li key={action.key}>
                        <button
                            type="button"
                            className="adminv2-ws-actions-rail-primary w-full text-left"
                            disabled={itemDisabled}
                            title={
                                busy ? "Action in progress…"
                                : disabledReason && itemDisabled ?
                                    disabledReason
                                :   action.label
                            }
                            data-drawer-rail-action-key={action.key}
                            onClick={() => {
                                if (itemDisabled) return;
                                onActionSelect(action);
                            }}
                        >
                            {busy ? "…" : action.label}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
