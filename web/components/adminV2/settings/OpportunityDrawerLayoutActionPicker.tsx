"use client";

import { useEffect, useMemo, useState } from "react";
import {
    buildLayoutEditorActionCatalogGroups,
    type LayoutEditorActionCatalogEntry,
    type LayoutEditorActionPickerContext,
} from "@/lib/layout/layoutEditorActionCatalog";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";

type Props = {
    surfaceKey?: DrawerLayoutEditorSurfaceKey;
    context?: LayoutEditorActionPickerContext;
    disabled?: boolean;
    onPickAction: (entry: LayoutEditorActionCatalogEntry) => void;
    variant?: "default" | "inspector";
};

export default function OpportunityDrawerLayoutActionPicker({
    surfaceKey = "opportunity_drawer",
    context = "section_row",
    disabled = false,
    onPickAction,
    variant = "default",
}: Props) {
    const groups = useMemo(
        () => buildLayoutEditorActionCatalogGroups({ surfaceKey, context }),
        [surfaceKey, context],
    );
    const [groupKey, setGroupKey] = useState(groups[0]?.groupKey ?? "contact_actions");
    const [query, setQuery] = useState("");
    const isInspector = variant === "inspector";

    useEffect(() => {
        if (!groups.some((g) => g.groupKey === groupKey)) {
            setGroupKey(groups[0]?.groupKey ?? "contact_actions");
        }
    }, [groups, groupKey]);

    const activeGroup = groups.find((g) => g.groupKey === groupKey) ?? groups[0];
    const normalizedQuery = query.trim().toLowerCase();

    const filteredActions = useMemo(() => {
        const actions = activeGroup?.actions ?? [];
        if (!normalizedQuery) return actions;
        return actions.filter(
            (entry) =>
                entry.label.toLowerCase().includes(normalizedQuery)
                || entry.description.toLowerCase().includes(normalizedQuery),
        );
    }, [activeGroup?.actions, normalizedQuery]);

    return (
        <div
            className={`space-y-3 rounded-xl border border-alloy-forge/12 bg-white p-3 shadow-sm ${
                isInspector ? "border-alloy-pine/20" : "bg-alloy-stone/[0.02] p-2"
            }`}
            data-testid="visual-editor-action-picker"
        >
            <p className={`font-semibold uppercase tracking-wide text-alloy-midnight/45 ${isInspector ? "text-xs" : "text-[10px]"}`}>
                Add action
            </p>

            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search actions…"
                className="w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                data-testid="visual-editor-action-picker-search"
            />

            {groups.length > 1 ?
                <div className="flex flex-wrap gap-1">
                    {groups.map((group) => (
                        <button
                            key={group.groupKey}
                            type="button"
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                group.groupKey === activeGroup?.groupKey ?
                                    "bg-alloy-pine/10 text-alloy-pine"
                                :   "text-alloy-midnight/45 hover:text-alloy-pine"
                            }`}
                            onClick={() => setGroupKey(group.groupKey)}
                        >
                            {group.groupLabel}
                        </button>
                    ))}
                </div>
            :   null}

            {activeGroup?.groupDescription ?
                <p className="text-[10px] leading-relaxed text-alloy-midnight/45">{activeGroup.groupDescription}</p>
            :   null}

            <ul className={`max-h-48 space-y-1 overflow-y-auto ${isInspector ? "" : "max-h-40"}`}>
                {filteredActions.map((entry) => {
                    const pickable = entry.selectableInActionPicker && !disabled;
                    return (
                        <li key={entry.actionKey}>
                            <button
                                type="button"
                                disabled={!pickable}
                                className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] ${
                                    pickable ?
                                        "border-alloy-forge/15 hover:border-alloy-pine/25 hover:bg-alloy-pine/[0.04]"
                                    :   "cursor-not-allowed border-alloy-forge/10 bg-alloy-stone/[0.03] opacity-70"
                                }`}
                                onClick={() => {
                                    if (!pickable) return;
                                    onPickAction(entry);
                                    setQuery("");
                                }}
                                data-testid={`visual-editor-pick-action-${entry.actionKey}`}
                            >
                                <span className="font-medium text-alloy-midnight">{entry.label}</span>
                                <span className="mt-0.5 block text-[10px] text-alloy-midnight/45">{entry.description}</span>
                                {entry.helperCopy ?
                                    <span className="mt-1 block text-[10px] text-alloy-midnight/55">{entry.helperCopy}</span>
                                :   null}
                                {!entry.selectableInActionPicker && entry.disabledReason ?
                                    <span className="mt-1 block text-[10px] text-amber-700/80">{entry.disabledReason}</span>
                                :   null}
                                {entry.selectableInActionPicker && !entry.runtimeWired && entry.runtimeWiredNote ?
                                    <span className="mt-1 block text-[10px] text-alloy-midnight/40">{entry.runtimeWiredNote}</span>
                                :   null}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
