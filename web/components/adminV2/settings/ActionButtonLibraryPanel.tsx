"use client";

import { forwardRef, useMemo } from "react";
import {
    ACTION_CATEGORY_LABELS,
    type ActionDefinitionCategory,
    type ActionRegistryEntry,
} from "@/lib/admin/actions/actionDefinitionRegistry";
import {
    listAddableActionLibraryEntries,
    type ActionCatalogDefinitionRef,
} from "@/lib/admin/actions/actionButtonLibraryChooser";

export type ActionCatalogDefinition = ActionCatalogDefinitionRef & {
    label: string;
    action_type: string;
    entity_type: string | null;
};

type Props = {
    catalog: ActionCatalogDefinition[];
    /** Inventory + catalog fetch finished (chooser may still list zero addable actions). */
    catalogReady?: boolean;
    /** Inventory still loading — show chooser shell with loading hint. */
    catalogLoading?: boolean;
    onAdd: (entry: ActionRegistryEntry, definitionId: string) => void;
    disabled?: boolean;
    disabledReason?: string;
};

function categoryChipClass(category: ActionDefinitionCategory): string {
    switch (category) {
        case "communication":
            return "bg-sky-500/8 text-sky-900/90";
        case "bos_native":
            return "bg-violet-500/8 text-violet-900/90";
        case "status_lifecycle":
            return "bg-amber-500/10 text-amber-900/85";
        case "workflow":
            return "bg-alloy-pine/8 text-alloy-pine";
        default:
            return "bg-alloy-forge/8 text-alloy-midnight/55";
    }
}

const ActionButtonLibraryPanel = forwardRef<HTMLElement, Props>(function ActionButtonLibraryPanel(
    { catalog, catalogReady = true, catalogLoading = false, onAdd, disabled, disabledReason },
    ref
) {
    const addable = useMemo(() => listAddableActionLibraryEntries(catalog), [catalog]);

    if (!catalogReady && !catalogLoading) return null;

    return (
        <section
            ref={ref}
            className="scroll-mt-6 space-y-3 rounded-xl border border-alloy-pine/20 bg-alloy-pine/[0.04] px-4 py-4 sm:px-5"
            data-testid="action-button-chooser"
        >
            <div>
                <h2 className="text-sm font-semibold text-alloy-midnight">Add an action button</h2>
                <p className="mt-0.5 text-xs text-alloy-midnight/55">
                    Pick an action, then choose where it appears in the workspace or record drawer.
                </p>
            </div>

            {catalogLoading ? (
                <p className="text-xs text-alloy-midnight/50" role="status">
                    Loading available actions…
                </p>
            ) : addable.length === 0 ? (
                <p className="text-xs text-alloy-midnight/50" role="status">
                    No actions are available to add right now. If you recently enabled enrollment, try refreshing after
                    platform setup completes.
                </p>
            ) : (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {addable.map(({ entry, definitionId }) => (
                        <li
                            key={entry.key}
                            className="flex min-h-[3.25rem] items-center gap-2 rounded-lg border border-alloy-forge/12 bg-white px-3 py-2.5 shadow-sm"
                            data-testid={`action-chooser-${entry.key}`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="truncate text-xs font-semibold text-alloy-midnight">
                                        {entry.label}
                                    </span>
                                    <span
                                        className={`shrink-0 rounded px-1.5 py-px text-[9px] font-medium leading-none ${categoryChipClass(entry.category)}`}
                                    >
                                        {ACTION_CATEGORY_LABELS[entry.category]}
                                    </span>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/55">
                                    {entry.description}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={disabled}
                                title={disabled ? disabledReason : undefined}
                                data-testid={`action-chooser-add-${entry.key}`}
                                className="shrink-0 rounded-md border border-alloy-pine/30 bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-pine/90 disabled:cursor-not-allowed disabled:opacity-45"
                                onClick={() => onAdd(entry, definitionId)}
                            >
                                Add
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
});

export default ActionButtonLibraryPanel;
