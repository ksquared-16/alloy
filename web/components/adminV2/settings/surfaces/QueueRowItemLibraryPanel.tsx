"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    filterLibraryBySearch,
    libraryItemsByCategory,
    prioritizeLibraryForRowFocus,
    type QueueRowLibraryItem,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import { isCompactRowEffectiveFieldKey } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
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
            className="pointer-events-auto fixed inset-0 z-[70] flex items-end justify-center bg-alloy-midnight/20 p-4 pb-6 sm:items-center sm:pb-4"
            role="dialog"
            aria-label="Add to queue row"
            data-queue-row-item-library
            onClick={onClose}
        >
            <div
                className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="shrink-0 flex items-center justify-between border-b border-alloy-stone/10 px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-alloy-midnight">{sectionLabel ?? "Add to row"}</p>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Choose a field or widget to place on the row.</p>
                        <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/40">
                            Library order follows <span className="font-medium capitalize">{rowFocusUi}</span> focus. {SURFACE_FIELD_ROW_FOCUS_HELP}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10" aria-label="Close library" data-library-close>✕</button>
                </header>
                <div className="shrink-0 border-b border-alloy-stone/10 px-4 py-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm"
                        data-library-search
                    />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" data-library-scroll>
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
                                        // One vocabulary with the inline picker: a field renders in the compact
                                        // row ONLY if its key maps to a slot; widgets never render in the row.
                                        // Flag non-effective picks so the operator never publishes a silent no-op.
                                        const compactEffective =
                                            item.kind === "field" ? isCompactRowEffectiveFieldKey(item.fieldKey) : false;
                                        return (
                                            <li key={`${item.kind}-${key}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => onPick(item)}
                                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-alloy-pine/[0.06]"
                                                    data-library-field={item.kind === "field" ? item.fieldKey : undefined}
                                                    data-library-widget={item.kind === "widget" ? item.widgetKey : undefined}
                                                    data-compact-effective={compactEffective ? "true" : "false"}
                                                >
                                                    <span className="text-[11px] text-alloy-pine">+</span>
                                                    <span className={`flex-1 text-[12px] ${compactEffective ? "text-alloy-midnight/80" : "text-alloy-midnight/45"}`}>
                                                        {item.label}
                                                    </span>
                                                    {!compactEffective ? (
                                                        <span
                                                            className="shrink-0 rounded-full bg-alloy-stone/15 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45"
                                                            title={item.kind === "widget"
                                                                ? "Widgets do not render in the compact queue row."
                                                                : "This field does not render in the compact queue row."}
                                                        >
                                                            Not in row
                                                        </span>
                                                    ) : null}
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
