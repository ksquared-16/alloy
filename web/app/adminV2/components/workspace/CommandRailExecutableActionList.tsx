"use client";

import { Calendar, ChevronRight, UserPlus, Zap, type LucideIcon } from "lucide-react";

import { BOS_IDENTITY } from "@/lib/bos/bosIdentityTokens";

export type CommandRailExecutableAction = {
    id: string;
    label: string;
    /** Optional operator-facing why / consequence under the label. */
    reason?: string;
    disabled?: boolean;
    busy?: boolean;
    emphasized?: boolean;
    onClick: () => void;
    "data-testid"?: string;
};

function resolveActionIcon(id: string): LucideIcon {
    const key = id.toLowerCase();
    if (key.includes("create_lead") || key.includes("create-lead")) return UserPlus;
    if (key.includes("schedule_tour") || key.includes("schedule-tour")) return Calendar;
    return Zap;
}

/** Executable command-rail rows — icon, label, chevron; matches BOS starter card rhythm. */
export function CommandRailExecutableActionList({ actions }: { actions: CommandRailExecutableAction[] }) {
    if (actions.length === 0) return null;

    return (
        <ul className="adminv2-command-rail-executable-actions" data-command-rail-executable-actions="true">
            {actions.map((action) => {
                const Icon = resolveActionIcon(action.id);
                const disabled = action.disabled || action.busy;

                return (
                    <li key={action.id}>
                        <button
                            type="button"
                            className="adminv2-command-rail-executable-action group"
                            disabled={disabled}
                            onClick={action.onClick}
                            data-testid={action["data-testid"]}
                            data-command-rail-action-id={action.id}
                            style={
                                action.emphasized ?
                                    { boxShadow: "0 0 0 2px rgba(0, 162, 131, 0.35)" }
                                :   undefined
                            }
                        >
                            <span className="adminv2-command-rail-executable-action-icon" aria-hidden>
                                <Icon stroke={BOS_IDENTITY.bendPine} strokeWidth={1.75} className="h-4 w-4" />
                            </span>
                            <span className="adminv2-command-rail-executable-action-copy min-w-0 flex-1 text-left">
                                <span className="adminv2-command-rail-executable-action-label block">
                                    {action.busy ? "…" : action.label}
                                </span>
                                {action.reason ?
                                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-alloy-midnight/45">
                                        {action.reason}
                                    </span>
                                :   null}
                            </span>
                            <ChevronRight
                                className="adminv2-command-rail-executable-action-chevron h-4 w-4 shrink-0"
                                stroke="rgba(39, 63, 82, 0.45)"
                                strokeWidth={1.75}
                                aria-hidden
                            />
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
