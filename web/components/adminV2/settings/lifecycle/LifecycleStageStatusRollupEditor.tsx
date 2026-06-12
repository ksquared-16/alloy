"use client";

import Link from "next/link";
import { useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
    flattenStatusRollupKeys,
    isCategoryEnabled,
    selectedCountForCategory,
    statusRollupDirty,
    toggleCategoryEnabled,
    toggleStatusInRollup,
    type StatusCategoryGroup,
    type StatusRollupCategoryKey,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";
import { STAGE_MEMBERSHIP_INCLUDED_STATUSES_EMPTY } from "@/lib/lifecycle/queueMembershipUiLabels";

export type LifecycleStageStatusRollupEditorHandle = {
    getDraftRollup: () => StatusRollupV1 | null;
    isDirty: () => boolean;
};

export default function LifecycleStageStatusRollupEditor({
    catalog,
    savedRollup,
    statusesSettingsHref = "/admin/settings/statuses?entity_type=opportunities",
    onRollupChange,
    editorRef,
}: {
    catalog: readonly StatusCategoryGroup[];
    savedRollup: StatusRollupV1 | null;
    statusesSettingsHref?: string;
    onRollupChange: (rollup: StatusRollupV1, flatKeys: string[]) => void;
    editorRef?: React.RefObject<LifecycleStageStatusRollupEditorHandle | null>;
}) {
    const [draft, setDraft] = useState<StatusRollupV1 | null>(savedRollup);

    useEffect(() => {
        setDraft(savedRollup);
    }, [savedRollup]);

    const enabledCategories = useMemo(
        () => catalog.filter((g) => isCategoryEnabled(draft, g.category_key)),
        [catalog, draft]
    );

    const multiCategory = (draft?.categories.length ?? 0) > 1;

    const emitChange = (next: StatusRollupV1) => {
        setDraft(next);
        onRollupChange(next, flattenStatusRollupKeys(next));
    };

    useImperativeHandle(editorRef, () => ({
        getDraftRollup: () => draft,
        isDirty: () => statusRollupDirty(savedRollup, draft),
    }));

    if (!catalog.length) {
        return (
            <div className="space-y-2" data-testid="lifecycle-status-rollup-empty-catalog">
                <p className="text-xs text-alloy-midnight/60">{STAGE_MEMBERSHIP_INCLUDED_STATUSES_EMPTY}</p>
                <Link
                    href={statusesSettingsHref}
                    className="inline-flex rounded-md border border-alloy-pine/30 bg-alloy-pine/5 px-2.5 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/10"
                >
                    Create status definitions
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-status-rollup-editor">
            <div data-testid="lifecycle-status-category-selector">
                <p className="mb-2 text-[11px] font-medium text-alloy-midnight/70">Status categories</p>
                <ul className="space-y-1">
                    {catalog.map((group) => {
                        const enabled = isCategoryEnabled(draft, group.category_key);
                        const count = selectedCountForCategory(draft, group.category_key);
                        return (
                            <li key={group.category_key}>
                                <label className="flex cursor-pointer items-center gap-2 rounded border border-alloy-forge/10 px-2 py-1.5 text-xs hover:bg-alloy-stone/5">
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => {
                                            if (!draft) return;
                                            emitChange(
                                                toggleCategoryEnabled(draft, group, e.target.checked)
                                            );
                                        }}
                                        data-testid={`lifecycle-status-category-${group.category_key}`}
                                    />
                                    <span className="font-medium text-alloy-midnight">{group.label}</span>
                                    {enabled ?
                                        <span className="text-[10px] text-alloy-midnight/50">
                                            {count} selected
                                        </span>
                                    :   null}
                                </label>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {multiCategory ?
                <p className="text-[10px] text-alloy-midnight/50" data-testid="lifecycle-status-multi-category-note">
                    Multiple categories use OR matching — a row appears when it matches any selected status.
                    Row subject still follows &quot;This stage is for&quot; above.
                </p>
            :   null}

            {enabledCategories.length === 0 ?
                <p className="text-xs text-alloy-midnight/60" data-testid="lifecycle-status-rollup-no-categories">
                    Select at least one status category.
                </p>
            :   enabledCategories.map((group) => (
                    <section
                        key={group.category_key}
                        className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/5 p-2"
                        data-testid={`lifecycle-status-category-panel-${group.category_key}`}
                    >
                        <h5 className="mb-2 text-[11px] font-semibold text-alloy-midnight/80">{group.label}</h5>
                        {group.statuses.length === 0 ?
                            <p className="text-xs text-alloy-midnight/50">
                                No statuses configured for this category.
                            </p>
                        :   <ul className="space-y-1" data-testid={`lifecycle-status-list-${group.category_key}`}>
                                {group.statuses.map((row) => {
                                    const cat = draft?.categories.find(
                                        (c) => c.category_key === group.category_key
                                    );
                                    const checked = Boolean(
                                        cat?.selected_status_keys.includes(row.status_key)
                                    );
                                    return (
                                        <li key={row.status_key}>
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={checked}
                                                className={`flex w-full cursor-pointer items-center gap-2 rounded border border-alloy-forge/10 px-2 py-1 text-left text-xs hover:bg-white/60 ${
                                                    checked ? "border-alloy-pine/35 bg-alloy-pine/5" : ""
                                                }`}
                                                data-testid={`lifecycle-status-row-${row.status_key}`}
                                                data-status-key={row.status_key}
                                                onClick={() => {
                                                    if (!draft) return;
                                                    emitChange(
                                                        toggleStatusInRollup(
                                                            draft,
                                                            group.category_key,
                                                            row.status_key,
                                                            !checked
                                                        )
                                                    );
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    readOnly
                                                    tabIndex={-1}
                                                    className="pointer-events-none shrink-0"
                                                    checked={checked}
                                                    aria-hidden
                                                />
                                                <span>{row.status_label}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        }
                    </section>
                ))
            }

            {flattenStatusRollupKeys(draft).length === 0 ?
                <p className="text-xs text-amber-800" data-testid="lifecycle-status-rollup-hint">
                    Select at least one status to continue.
                </p>
            :   null}

            <Link
                href={statusesSettingsHref}
                className="inline-block text-[11px] font-medium text-alloy-pine hover:underline"
            >
                Create or edit status definitions
            </Link>
        </div>
    );
}
