"use client";

import { useEffect, useState } from "react";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
    CONFIG_WORKSPACE_ROW_INNER_CLASS,
} from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { FolderOpen } from "lucide-react";

export type ConfigurationCategoryRowModel = {
    id: string;
    section_key: string;
    label: string;
    description: string | null;
    sort_order: number;
    is_archived: boolean;
    field_count?: number;
};

type Props = {
    category: ConfigurationCategoryRowModel;
    expanded: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    canMutate?: boolean;
    saving?: boolean;
    error?: string | null;
    onExpand: () => void;
    onCollapse: () => void;
    onSave: (values: { label: string; description: string }) => void | Promise<void>;
    onArchive: () => void | Promise<void>;
    onMoveUp?: () => void | Promise<void>;
    onMoveDown?: () => void | Promise<void>;
};

export default function ConfigurationCategoryRow({
    category,
    expanded,
    canMoveUp = false,
    canMoveDown = false,
    canMutate = false,
    saving = false,
    error = null,
    onExpand,
    onCollapse,
    onSave,
    onArchive,
    onMoveUp,
    onMoveDown,
}: Props) {
    const [label, setLabel] = useState(category.label);
    const [description, setDescription] = useState(category.description ?? "");

    useEffect(() => {
        if (expanded) {
            setLabel(category.label);
            setDescription(category.description ?? "");
        }
    }, [expanded, category]);

    const statusLabel = category.is_archived ? "Archived" : "Active";

    return (
        <div
            className={[CONFIG_WORKSPACE_ROW_CLASS, expanded ? CONFIG_WORKSPACE_ROW_EXPANDED_CLASS : ""].join(" ")}
            data-testid="configuration-category-row"
            data-category-key={category.section_key}
            data-expanded={expanded ? "true" : "false"}
        >
            <div className={CONFIG_WORKSPACE_ROW_INNER_CLASS}>
                <FolderOpen size={13} strokeWidth={DATA_MODEL_ICON_STROKE} className="shrink-0 text-alloy-bend-pine" aria-hidden />
                <button type="button" onClick={onExpand} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] font-medium text-alloy-midnight">{category.label}</span>
                </button>
                {typeof category.field_count === "number" ? (
                    <span className="hidden shrink-0 text-[10px] text-alloy-midnight/40 sm:inline">
                        {category.field_count} field{category.field_count === 1 ? "" : "s"}
                    </span>
                ) : null}
                <span
                    className={[
                        "shrink-0 text-[10px] font-medium",
                        category.is_archived ? "text-alloy-midnight/35" : "text-alloy-bend-pine/80",
                    ].join(" ")}
                >
                    {statusLabel}
                </span>
                <button
                    type="button"
                    onClick={expanded ? onCollapse : onExpand}
                    className={[CONFIG_WORKSPACE_GHOST_ACTION_CLASS, expanded ? "opacity-100" : ""].join(" ")}
                    data-testid="configuration-category-edit"
                >
                    {expanded ? "Close" : "Edit"}
                </button>
            </div>
            {expanded ? (
                <div className="space-y-2 border-t border-alloy-forge/8 px-3 pb-2.5 pt-2" data-testid="configuration-category-editor">
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Name</span>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid="category-edit-label"
                        />
                    </label>
                    <label className="block space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            Description
                        </span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                            data-testid="category-edit-description"
                        />
                    </label>
                    {error ? <p className="text-xs text-alloy-ember">{error}</p> : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-1">
                            {canMutate && onMoveUp ? (
                                <button
                                    type="button"
                                    disabled={saving || !canMoveUp}
                                    onClick={() => void onMoveUp()}
                                    className="config-secondary-btn rounded border border-alloy-forge/12 px-2 py-0.5 text-[10px] text-alloy-midnight/60 disabled:opacity-40"
                                    data-testid="category-move-up"
                                >
                                    Move up
                                </button>
                            ) : null}
                            {canMutate && onMoveDown ? (
                                <button
                                    type="button"
                                    disabled={saving || !canMoveDown}
                                    onClick={() => void onMoveDown()}
                                    className="config-secondary-btn rounded border border-alloy-forge/12 px-2 py-0.5 text-[10px] text-alloy-midnight/60 disabled:opacity-40"
                                    data-testid="category-move-down"
                                >
                                    Move down
                                </button>
                            ) : null}
                            {canMutate && !category.is_archived ? (
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void onArchive()}
                                    className="text-[10px] font-medium text-alloy-midnight/45 hover:text-alloy-ember"
                                    data-testid="category-archive"
                                >
                                    Archive
                                </button>
                            ) : null}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={onCollapse}
                                className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70"
                            >
                                Cancel
                            </button>
                            {canMutate ? (
                                <button
                                    type="button"
                                    disabled={saving || !label.trim()}
                                    onClick={() => void onSave({ label: label.trim(), description: description.trim() })}
                                    className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                    data-testid="category-save"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
