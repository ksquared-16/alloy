"use client";

/**
 * Canonical workspace chrome: Left navigation → Work area.
 *
 * The shared shell for every operational workspace (POS, Forms, Layout Builder,
 * Processing, future Packet Builder). White sidebar with Bend Pine active state,
 * white canvas — NO navy slab, NO beige. The BOS rail lives OUTSIDE this (owned by
 * the modal shell); this component never renders or touches it.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { WS_CANVAS, WS_NAV_GROUP_LABEL, WS_NAV_ITEM_ACTIVE, WS_NAV_ITEM_IDLE } from "./workspaceTokens";

export interface WorkspaceNavItem<K extends string = string> {
    key: K;
    label: string;
    icon: LucideIcon;
    group: string;
}

export default function WorkspaceShell<K extends string>({
    items,
    active,
    onNavigate,
    groupLabels = {},
    width = "8.5rem",
    navHeader,
    children,
}: {
    items: ReadonlyArray<WorkspaceNavItem<K>>;
    active: K;
    onNavigate: (key: K) => void;
    groupLabels?: Record<string, string>;
    width?: string;
    /** Optional element rendered at the top of the nav column (e.g. a mode switcher). */
    navHeader?: ReactNode;
    children: ReactNode;
}) {
    let lastGroup: string | null = null;
    return (
        <div className="flex min-h-0 flex-1 overflow-hidden">
            <nav
                aria-label="Workspace sections"
                className="flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-alloy-stone/12 bg-white px-2 py-2.5"
                style={{ width }}
            >
                {navHeader ? <div className="mb-1">{navHeader}</div> : null}
                {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.key;
                    const showGroup = item.group !== lastGroup;
                    lastGroup = item.group;
                    return (
                        <div key={item.key}>
                            {showGroup && groupLabels[item.group] ? (
                                <div className={`px-2 pb-1 pt-2 ${WS_NAV_GROUP_LABEL}`}>{groupLabels[item.group]}</div>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => onNavigate(item.key)}
                                aria-current={isActive ? "page" : undefined}
                                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                                    isActive ? WS_NAV_ITEM_ACTIVE : WS_NAV_ITEM_IDLE
                                }`}
                            >
                                <Icon
                                    size={15}
                                    strokeWidth={1.9}
                                    className={isActive ? "text-alloy-juniper" : "text-alloy-midnight/45"}
                                    aria-hidden
                                />
                                <span className="truncate">{item.label}</span>
                            </button>
                        </div>
                    );
                })}
            </nav>
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${WS_CANVAS}`}>{children}</div>
        </div>
    );
}
