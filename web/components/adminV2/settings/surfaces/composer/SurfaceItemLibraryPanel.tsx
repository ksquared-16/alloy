"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SURFACE_COMPOSER_LIBRARY_ATTR } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import type { SurfaceComposerLibraryCategory } from "@/lib/adminV2/settings/surfaces/surfaceComposerLibraryModel";

export type SurfaceItemLibraryPanelProps<TItem> = {
    open: boolean;
    categories: readonly SurfaceComposerLibraryCategory<TItem>[];
    sectionLabel?: string;
    subtitle?: string;
    ariaLabel?: string;
    itemKey: (item: TItem) => string;
    itemLabel: (item: TItem) => string;
    itemMeta?: (item: TItem) => string | null;
    /** Optional availability status for capability-engine badges in the library. */
    itemAvailability?: (item: TItem) => "available" | "unavailable" | "unknown" | null;
    onPick: (item: TItem) => void;
    onClose: () => void;
    headerNote?: React.ReactNode;
};

export default function SurfaceItemLibraryPanel<TItem>({
    open,
    categories,
    sectionLabel = "Add to surface",
    subtitle = "Choose a component to place on the surface.",
    ariaLabel = "Add to surface",
    itemKey,
    itemLabel,
    itemMeta,
    itemAvailability,
    onPick,
    onClose,
    headerNote,
}: SurfaceItemLibraryPanelProps<TItem>) {
    const [search, setSearch] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setSearch("");
            return;
        }
        const frame = window.requestAnimationFrame(() => {
            searchRef.current?.focus();
            searchRef.current?.select();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [open]);

    const filteredCategories = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return categories;
        return categories
            .map((cat) => ({
                ...cat,
                items: cat.items.filter((item) => {
                    const label = itemLabel(item).toLowerCase();
                    const meta = itemMeta?.(item)?.toLowerCase() ?? "";
                    const key = itemKey(item).toLowerCase();
                    return label.includes(q) || meta.includes(q) || key.includes(q);
                }),
            }))
            .filter((cat) => cat.items.length > 0);
    }, [categories, itemKey, itemLabel, itemMeta, search]);

    if (!open) return null;

    const panel = (
        <div
            className="pointer-events-auto fixed inset-0 z-[70] flex items-start justify-center bg-alloy-midnight/20 p-4 pt-16"
            role="dialog"
            aria-label={ariaLabel}
            {...{ [SURFACE_COMPOSER_LIBRARY_ATTR]: true }}
            onClick={onClose}
        >
            <div
                className="max-h-[min(70vh,560px)] w-full max-w-lg overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-alloy-midnight">{sectionLabel}</p>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/50">{subtitle}</p>
                        {headerNote}
                    </div>
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10" aria-label="Close library" data-library-close>✕</button>
                </header>
                <div className="border-b border-alloy-stone/10 px-4 py-2">
                    <input
                        ref={searchRef}
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className="w-full rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm"
                        data-library-search
                    />
                </div>
                <div className="max-h-[calc(min(70vh,560px)-6.5rem)] overflow-y-auto p-3">
                    {filteredCategories.length === 0 ? (
                        <p className="px-2 py-4 text-[12px] text-alloy-midnight/45">No items match your search.</p>
                    ) : (
                        filteredCategories.map((category) => (
                            <section key={category.key} className="mb-4" data-library-category={category.key}>
                                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">{category.label}</p>
                                <ul className="space-y-0.5">
                                    {category.items.map((item) => {
                                        const meta = itemMeta?.(item);
                                        const availability = itemAvailability?.(item) ?? null;
                                        return (
                                            <li key={itemKey(item)}>
                                                <button
                                                    type="button"
                                                    className={[
                                                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-alloy-bend-pine/[0.06]",
                                                        availability === "unavailable" ? "opacity-70" : "",
                                                    ].join(" ")}
                                                    data-library-item={itemKey(item)}
                                                    data-library-availability={availability ?? undefined}
                                                    onClick={() => onPick(item)}
                                                >
                                                    <span className="font-medium text-alloy-midnight">{itemLabel(item)}</span>
                                                    <span className="ml-2 flex shrink-0 items-center gap-1.5">
                                                        {availability === "unavailable" ? (
                                                            <span className="rounded-full border border-alloy-stone/30 bg-alloy-stone/[0.08] px-1.5 py-px text-[9px] font-medium text-alloy-midnight/45">
                                                                Unavailable
                                                            </span>
                                                        ) : availability === "available" ? (
                                                            <span className="rounded-full border border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.08] px-1.5 py-px text-[9px] font-medium text-alloy-bend-pine">
                                                                Available
                                                            </span>
                                                        ) : null}
                                                        {meta ?
                                                            <span className="truncate text-[10px] text-alloy-midnight/40">{meta}</span>
                                                        :   null}
                                                    </span>
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

    return typeof document !== "undefined" ? createPortal(panel, document.body) : panel;
}
