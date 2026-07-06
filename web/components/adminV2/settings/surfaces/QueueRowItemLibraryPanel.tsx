"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    filterLibraryBySearch,
    libraryItemsByCategory,
    prioritizeLibraryForRowFocus,
    type QueueRowLibraryItem,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import {
    canvasRegionLabel,
    type CanvasAnatomyRegion,
} from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import type { QueueRowSubjectFocusUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";

export type QueueRowItemLibraryPanelProps = {
    open: boolean;
    targetRegion: CanvasAnatomyRegion | null;
    rowFocus?: QueueRowSubjectFocusUi | null;
    items: readonly QueueRowLibraryItem[];
    onPick: (item: QueueRowLibraryItem) => void;
    onClose: () => void;
};

export default function QueueRowItemLibraryPanel({
    open,
    targetRegion,
    rowFocus = null,
    items,
    onPick,
    onClose,
}: QueueRowItemLibraryPanelProps) {
    const [search, setSearch] = useState("");

    const filteredItems = useMemo(
        () => filterLibraryBySearch(items.filter((item) => item.kind !== "zone"), search),
        [items, search],
    );
    const categories = useMemo(() => {
        const grouped = libraryItemsByCategory(filteredItems);
        return rowFocus ? prioritizeLibraryForRowFocus(grouped, rowFocus) : grouped;
    }, [filteredItems, rowFocus]);

    if (!open) return null;

    const panel = (
        <div className="pointer-events-auto fixed inset-0 z-[70] flex items-start justify-center bg-alloy-midnight/20 p-4 pt-16" role="dialog" aria-label="Add to queue row" data-queue-row-item-library onClick={onClose}>
            <div className="max-h-[min(70vh,560px)] w-full max-w-lg overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <header className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/40">Item library</p>
                        <p className="text-sm font-semibold text-alloy-midnight">
                            {targetRegion ? `Add to ${canvasRegionLabel(targetRegion)}` : "Choose a field or widget"}
                        </p>
                        {targetRegion ? (
                            <p className="mt-0.5 text-[11px] text-alloy-pine/80" data-library-placement-prompt>
                                Placing in: {canvasRegionLabel(targetRegion)}
                            </p>
                        ) : (
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Click a row slot on the canvas first, then pick an item.</p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10" aria-label="Close library" data-library-close>✕</button>
                </header>
                <div className="border-b border-alloy-stone/10 px-4 py-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search fields and widgets…"
                        className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm"
                        data-library-search
                    />
                </div>
                <div className="max-h-[calc(min(70vh,560px)-5.5rem)] overflow-y-auto p-3">
                    {categories.length === 0 ? (
                        <p className="px-2 py-4 text-[12px] text-alloy-midnight/45">No items match your search.</p>
                    ) : (
                        categories.map((category) => (
                            <section key={category.key} className="mb-4" data-library-category={category.key}>
                                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">{category.label}</p>
                                <ul className="space-y-0.5">
                                    {category.items.map((item) => {
                                        const key = item.kind === "field" ? item.fieldKey : item.widgetKey;
                                        return (
                                            <li key={`${item.kind}-${key}`}>
                                                <button type="button" onClick={() => onPick(item)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-alloy-pine/[0.06]" data-library-field={item.kind === "field" ? item.fieldKey : undefined} data-library-widget={item.kind === "widget" ? item.widgetKey : undefined}>
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
