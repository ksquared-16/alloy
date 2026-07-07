"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    filterLibraryBySearch,
    libraryItemsByCategory,
    prioritizeLibraryForRowFocus,
    type QueueRowLibraryItem,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import type { QueueRowSubjectFocusUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import { SURFACE_FIELD_ROW_FOCUS_HELP } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

export type QueueRowItemLibraryPanelProps = {
    open: boolean;
    items: readonly QueueRowLibraryItem[];
    sectionLabel?: string;
    rowFocusUi?: QueueRowSubjectFocusUi;
    onPick: (item: QueueRowLibraryItem) => void;
    onClose: () => void;
};

export default function QueueRowItemLibraryPanel({
    open,
    items,
    sectionLabel,
    rowFocusUi = "family",
    onPick,
    onClose,
}: QueueRowItemLibraryPanelProps) {
    const [search, setSearch] = useState("");

    const categories = useMemo(() => {
        const filtered = filterLibraryBySearch(items.filter((item) => item.kind !== "zone"), search);
        return prioritizeLibraryForRowFocus(libraryItemsByCategory(filtered), rowFocusUi);
    }, [items, search, rowFocusUi]);

    if (!open) return null;

    const panel = (
        <div
            className="pointer-events-auto fixed inset-0 z-[70] flex items-start justify-center bg-alloy-midnight/20 p-4 pt-16"
            role="dialog"
            aria-label="Add to queue row"
            data-queue-row-item-library
            onClick={onClose}
        >
            <div
                className="max-h-[min(70vh,560px)] w-full max-w-lg overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-alloy-midnight">{sectionLabel ?? "Add to row"}</p>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Choose a field or widget to place on the row.</p>
                        <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/40">
                            Library order follows <span className="font-medium capitalize">{rowFocusUi}</span> focus. {SURFACE_FIELD_ROW_FOCUS_HELP}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10" aria-label="Close library" data-library-close>✕</button>
                </header>
                <div className="border-b border-alloy-stone/10 px-4 py-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm"
                        data-library-search
                    />
                </div>
                <div className="max-h-[calc(min(70vh,560px)-6.5rem)] overflow-y-auto p-3">
                    {categories.length === 0 ? (
                        <p className="px-2 py-4 text-[12px] text-alloy-midnight/45">No items match your search.</p>
                    ) : (
                        categories.map((category) => (
                            <section key={category.key} className="mb-4" data-library-category={category.key}>
                                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">{category.label}</p>
                                <ul className="space-y-0.5">
                                    {category.items.map((item) => {
                                        if (item.kind === "unavailable") {
                                            return (
                                                <li key={`unavailable-${item.fieldKey}`}>
                                                    <div
                                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left opacity-60"
                                                        data-library-unavailable={item.fieldKey}
                                                        title={item.reason}
                                                    >
                                                        <span className="text-[11px] text-alloy-stone/50">—</span>
                                                        <span className="flex-1 text-[12px] text-alloy-midnight/55">{item.label}</span>
                                                        <span className="text-[9px] text-alloy-midnight/40">{item.reason}</span>
                                                    </div>
                                                </li>
                                            );
                                        }
                                        const key = item.kind === "field" ? item.fieldKey : item.widgetKey;
                                        return (
                                            <li key={`${item.kind}-${key}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => onPick(item)}
                                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-alloy-pine/[0.06]"
                                                    data-library-field={item.kind === "field" ? item.fieldKey : undefined}
                                                    data-library-widget={item.kind === "widget" ? item.widgetKey : undefined}
                                                >
                                                    <span className="text-[11px] text-alloy-pine">+</span>
                                                    <span className="flex-1 text-[12px] text-alloy-midnight/80">{item.label}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    return typeof document === "undefined" ? panel : createPortal(panel, document.body);
}
