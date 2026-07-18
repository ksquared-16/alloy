"use client";

import { useState } from "react";
import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import {
    CommandRailExecutableActionList,
    type CommandRailExecutableAction,
} from "@/app/adminV2/components/workspace/CommandRailExecutableActionList";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";

export type ConfigurationRailActionGroup = "fix" | "next" | "manage" | "more";

export type ConfigurationRailAction = CommandRailExecutableAction & {
    group: ConfigurationRailActionGroup;
    reason?: string;
};

const GROUP_LABEL: Record<Exclude<ConfigurationRailActionGroup, "more">, string> = {
    fix: "Fix now",
    next: "Do next",
    manage: "Manage",
};

function ActionGroup({
    label,
    actions,
    testIdPrefix,
}: {
    label: string;
    actions: ConfigurationRailAction[];
    testIdPrefix: string;
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
                    "data-testid": action["data-testid"] ?? `${testIdPrefix}-${action.id}`,
                }))}
            />
        </div>
    );
}

/** Registers Configuration-native actions into the single shell command rail. */
export function ConfigurationCommandRailActions({
    actions,
    testIdPrefix = "configuration-rail",
    bodyTestId,
}: {
    actions: ConfigurationRailAction[];
    testIdPrefix?: string;
    bodyTestId?: string;
}) {
    const [moreOpen, setMoreOpen] = useState(false);
    const fix = actions.filter((action) => action.group === "fix");
    const next = actions.filter((action) => action.group === "next");
    const manage = actions.filter((action) => action.group === "manage");
    const more = actions.filter((action) => action.group === "more");
    const primaryCount = fix.length + next.length + manage.length;
    const body =
        actions.length > 0 ?
            <CommandRailCollapsibleActionsSection actionCount={primaryCount}>
                <div className="space-y-3 p-1" data-testid={bodyTestId ?? `${testIdPrefix}-actions`}>
                    <ActionGroup label={GROUP_LABEL.fix} actions={fix} testIdPrefix={testIdPrefix} />
                    <ActionGroup label={GROUP_LABEL.next} actions={next} testIdPrefix={testIdPrefix} />
                    <ActionGroup label={GROUP_LABEL.manage} actions={manage} testIdPrefix={testIdPrefix} />
                    {more.length > 0 ?
                        <div>
                            <button
                                type="button"
                                className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#007d68]"
                                onClick={() => setMoreOpen((current) => !current)}
                                aria-expanded={moreOpen}
                                data-testid={`${testIdPrefix}-more-toggle`}
                            >
                                {moreOpen ? "Fewer actions" : `More actions (${more.length})`}
                            </button>
                            {moreOpen ?
                                <CommandRailExecutableActionList
                                    actions={more.map((action) => ({
                                        ...action,
                                        "data-testid": action["data-testid"] ?? `${testIdPrefix}-${action.id}`,
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
