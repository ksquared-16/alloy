"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";
import { SURFACE_COMPOSER_LIBRARY_ATTR } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import {
    PROCESSING_BUILDER_CANONICAL_FIELDS,
    PROCESSING_BUILDER_GROUP_LABELS,
    PROCESSING_BUILDER_GROUP_ORDER,
    resolveProcessingBuilderRegistryEntry,
    type ProcessingBuilderCanonicalField,
    type ProcessingBuilderLibraryGroup,
} from "@/lib/forms/processingFormBuilderLibrary";
import type { BuilderFieldType } from "@/lib/forms/formBuilderSchema";

export type QuestionTypeItem = { type: BuilderFieldType; label: string; meta: string; category: string };

type LibraryTab = "question-types" | "alloy-fields";

export default function ProcessingFormBuilderLibraryPanel({
    open,
    sectionLabel,
    questionTypes,
    questionCategoryLabels,
    onPickQuestionType,
    onPickCanonicalField,
    onClose,
}: {
    open: boolean;
    sectionLabel: string;
    questionTypes: readonly QuestionTypeItem[];
    questionCategoryLabels: Record<string, string>;
    onPickQuestionType: (type: BuilderFieldType) => void;
    onPickCanonicalField: (field: ProcessingBuilderCanonicalField) => void;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<LibraryTab>("alloy-fields");
    const [search, setSearch] = useState("");

    const questionCategories = useMemo(() => {
        const q = search.trim().toLowerCase();
        const byCat = new Map<string, QuestionTypeItem[]>();
        for (const item of questionTypes) {
            if (q && !item.label.toLowerCase().includes(q) && !item.meta.toLowerCase().includes(q)) continue;
            const list = byCat.get(item.category) ?? [];
            list.push(item);
            byCat.set(item.category, list);
        }
        return [...byCat.entries()].map(([key, items]) => ({
            key,
            label: questionCategoryLabels[key] ?? key,
            items,
        }));
    }, [questionTypes, questionCategoryLabels, search]);

    const alloyGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const byGroup = new Map<ProcessingBuilderLibraryGroup, ProcessingBuilderCanonicalField[]>();
        for (const field of PROCESSING_BUILDER_CANONICAL_FIELDS) {
            if (q && !field.pickerLabel.toLowerCase().includes(q) && !field.pickerMeta.toLowerCase().includes(q)) continue;
            if (!resolveProcessingBuilderRegistryEntry(field)) continue;
            const list = byGroup.get(field.group) ?? [];
            list.push(field);
            byGroup.set(field.group, list);
        }
        return PROCESSING_BUILDER_GROUP_ORDER
            .map((group) => ({ group, label: PROCESSING_BUILDER_GROUP_LABELS[group], items: byGroup.get(group) ?? [] }))
            .filter((g) => g.items.length > 0);
    }, [search]);

    if (!open || typeof document === "undefined") return null;

    // Portals to `document.body`, so it escapes the Processing BOS modal shell's stacking context and
    // must clear the shell itself (panel 97 / backdrop 96). At the old z-[70] this panel opened BEHIND
    // the shell: "+ Add question" set state and rendered, but nothing was ever visible or clickable.
    // Same root cause as ProcessingAlloyDialog's z-[80] → z-[110] repair (395026bf8).
    return createPortal(
        <div
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            className="pointer-events-auto fixed inset-0 flex items-start justify-center bg-alloy-midnight/20 p-4 pt-16"
            role="dialog"
            aria-label="Add question"
            {...{ [SURFACE_COMPOSER_LIBRARY_ATTR]: true }}
            onClick={onClose}
        >
            <div
                className="max-h-[min(70vh,560px)] w-full max-w-lg overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl"
                data-testid="processing-form-builder-library"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="border-b border-alloy-stone/10 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-alloy-midnight">{sectionLabel}</p>
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Add a question type or pick an existing Alloy field.</p>
                        </div>
                        <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10" aria-label="Close library" data-library-close>
                            ✕
                        </button>
                    </div>
                    <div className="mt-3 flex gap-1 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.08] p-0.5">
                        <button
                            type="button"
                            data-library-tab="alloy-fields"
                            onClick={() => setTab("alloy-fields")}
                            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold ${tab === "alloy-fields" ? "bg-white text-alloy-midnight shadow-sm" : "text-alloy-midnight/55"}`}
                        >
                            Alloy fields
                        </button>
                        <button
                            type="button"
                            data-library-tab="question-types"
                            onClick={() => setTab("question-types")}
                            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold ${tab === "question-types" ? "bg-white text-alloy-midnight shadow-sm" : "text-alloy-midnight/55"}`}
                        >
                            Answer types
                        </button>
                    </div>
                </header>
                <div className="border-b border-alloy-stone/10 px-4 py-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-[12px]"
                        data-testid="form-builder-library-search"
                    />
                </div>
                <div className="max-h-[min(50vh,420px)] overflow-y-auto p-3">
                    {tab === "alloy-fields" ? (
                        alloyGroups.length === 0 ? (
                            <p className="py-6 text-center text-[12px] text-alloy-midnight/45">No Alloy fields match your search.</p>
                        ) : (
                            alloyGroups.map((group) => (
                                <section key={group.group} className="mb-4">
                                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{group.label}</h3>
                                    <ul className="space-y-1">
                                        {group.items.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    data-library-item={`alloy-${item.id}`}
                                                    onClick={() => onPickCanonicalField(item)}
                                                    className="flex w-full flex-col rounded-lg border border-alloy-stone/15 px-3 py-2 text-left hover:border-alloy-bend-pine/30 hover:bg-alloy-bend-pine/[0.04]"
                                                >
                                                    <span className="text-[12px] font-semibold text-alloy-midnight">{item.pickerLabel}</span>
                                                    <span className="text-[10px] text-alloy-midnight/45">{item.pickerMeta}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))
                        )
                    ) : questionCategories.length === 0 ? (
                        <p className="py-6 text-center text-[12px] text-alloy-midnight/45">No question types match your search.</p>
                    ) : (
                        questionCategories.map((cat) => (
                            <section key={cat.key} className="mb-4">
                                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{cat.label}</h3>
                                <ul className="space-y-1">
                                    {cat.items.map((item) => (
                                        <li key={item.type}>
                                            <button
                                                type="button"
                                                data-library-item={item.type}
                                                onClick={() => onPickQuestionType(item.type)}
                                                className="flex w-full flex-col rounded-lg border border-alloy-stone/15 px-3 py-2 text-left hover:border-alloy-bend-pine/30 hover:bg-alloy-bend-pine/[0.04]"
                                            >
                                                <span className="text-[12px] font-semibold text-alloy-midnight">{item.label}</span>
                                                <span className="text-[10px] text-alloy-midnight/45">{item.meta}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
