"use client";

import { CommandRailCollapsibleActionsSection } from "@/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection";
import {
    CommandRailExecutableActionList,
    type CommandRailExecutableAction,
} from "@/app/adminV2/components/workspace/CommandRailExecutableActionList";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";

export type LocationsRailActionGroup = "fix" | "manage";

export type LocationsRailAction = CommandRailExecutableAction & {
    group: LocationsRailActionGroup;
    reason?: string;
};

/**
 * Registers Location configuration commands into the shell Actions rail (above BOS).
 * Page owns understanding; shell owns contextual commands — no page-local Actions card.
 */
export function LocationsCommandRailActions({ actions }: { actions: LocationsRailAction[] }) {
    const fix = actions.filter((action) => action.group === "fix");
    const manage = actions.filter((action) => action.group === "manage");
    const count = actions.length;

    const body =
        count > 0 ?
            <CommandRailCollapsibleActionsSection actionCount={count}>
                <div className="space-y-3 p-1" data-testid="locations-command-rail-actions">
                    {fix.length > 0 ?
                        <div>
                            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">
                                Fix now
                            </p>
                            <CommandRailExecutableActionList
                                actions={fix.map(({ group: _g, reason: _r, ...action }) => ({
                                    ...action,
                                    "data-testid": action["data-testid"] ?? `locations-rail-${action.id}`,
                                }))}
                            />
                            {fix.some((action) => action.reason) ?
                                <ul className="mt-1 space-y-0.5 px-2">
                                    {fix
                                        .filter((action) => action.reason)
                                        .map((action) => (
                                            <li key={`reason-${action.id}`} className="text-[11px] text-alloy-midnight/45">
                                                {action.reason}
                                            </li>
                                        ))}
                                </ul>
                            :   null}
                        </div>
                    :   null}
                    {manage.length > 0 ?
                        <div>
                            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">
                                Manage
                            </p>
                            <CommandRailExecutableActionList
                                actions={manage.map(({ group: _g, reason: _r, ...action }) => ({
                                    ...action,
                                    "data-testid": action["data-testid"] ?? `locations-rail-${action.id}`,
                                }))}
                            />
                        </div>
                    :   null}
                </div>
            </CommandRailCollapsibleActionsSection>
        :   null;

    return <WorkspaceCommandRailRegistrar actions={body} actionsPlacementSurface="company" />;
}
