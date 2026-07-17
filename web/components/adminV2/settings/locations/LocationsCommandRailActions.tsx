"use client";

import { useState } from "react";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import {
    CommandRailExecutableActionList,
    type CommandRailExecutableAction,
} from "@/app/adminV2/components/workspace/CommandRailExecutableActionList";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";

export type LocationsRailActionGroup = "fix" | "next" | "manage" | "more";

export type LocationsRailAction = CommandRailExecutableAction & {
    group: LocationsRailActionGroup;
    reason?: string;
};

const GROUP_LABEL: Record<Exclude<LocationsRailActionGroup, "more">, string> = {
    fix: "Fix now",
    next: "Do next",
    manage: "Manage",
};

function ActionGroup({
    label,
    actions,
}: {
    label: string;
    actions: LocationsRailAction[];
}) {
    if (actions.length === 0) return null;
    return (
        <div>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">
                {label}
            </p>
            <CommandRailExecutableActionList
                actions={actions.map((action) => ({
                    ...action,
                    emphasized: action.emphasized ?? label === "Fix now",
                    "data-testid": action["data-testid"] ?? `locations-rail-${action.id}`,
                }))}
            />
        </div>
    );
}

/**
 * Registers Location configuration commands into the shell Actions rail (above BOS).
 * Evaluated contextual surface: Fix now → Do next → Manage → More actions.
 */
export function LocationsCommandRailActions({ actions }: { actions: LocationsRailAction[] }) {
    const [moreOpen, setMoreOpen] = useState(false);
    const fix = actions.filter((action) => action.group === "fix");
    const next = actions.filter((action) => action.group === "next");
    const manage = actions.filter((action) => action.group === "manage");
    const more = actions.filter((action) => action.group === "more");
    const primaryCount = fix.length + next.length + manage.length;
    const count = actions.length;

    const body =
        count > 0 ?
            <CommandRailCollapsibleActionsSection actionCount={primaryCount}>
                <div className="space-y-3 p-1" data-testid="locations-command-rail-actions">
                    <ActionGroup label={GROUP_LABEL.fix} actions={fix} />
                    <ActionGroup label={GROUP_LABEL.next} actions={next} />
                    <ActionGroup label={GROUP_LABEL.manage} actions={manage} />
                    {more.length > 0 ?
                        <div>
                            <button
                                type="button"
                                className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#007d68]"
                                onClick={() => setMoreOpen((current) => !current)}
                                aria-expanded={moreOpen}
                                data-testid="locations-rail-more-toggle"
                            >
                                {moreOpen ? "Fewer actions" : `More actions (${more.length})`}
                            </button>
                            {moreOpen ?
                                <CommandRailExecutableActionList
                                    actions={more.map((action) => ({
                                        ...action,
                                        "data-testid": action["data-testid"] ?? `locations-rail-${action.id}`,
                                    }))}
                                />
                            :   null}
                        </div>
                    :   null}
                </div>
            </CommandRailCollapsibleActionsSection>
        :   null;

    return <WorkspaceCommandRailRegistrar actions={body} actionsPlacementSurface="company" />;
}
