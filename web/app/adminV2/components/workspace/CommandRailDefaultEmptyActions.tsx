"use client";

import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";

/** Collapsed Actions (0) — header always visible when no page actions are registered. */
export function CommandRailDefaultEmptyActions() {
    return (
        <CommandRailCollapsibleActionsSection actionCount={0} loading={false}>
            <p className="px-2 pb-2 text-[11px] text-alloy-midnight/45">No actions in this context.</p>
        </CommandRailCollapsibleActionsSection>
    );
}
