"use client";

import { createPortal } from "react-dom";
import {
    filterLibraryForTargetZone,
    libraryItemsByCategory,
    queueRowZoneLabel,
    type QueueRowLibraryItem,
    type QueueRowLibraryZoneKey,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";

export type QueueRowItemLibraryPanelProps = {
    open: boolean;
    targetZone: QueueRowLibraryZoneKey | null;
    items: readonly QueueRowLibraryItem[];
    onPick: (item: QueueRowLibraryItem) => void;
    onClose: () => void;
};

export default function QueueRowItemLibraryPanel({ open, targetZone, items, onPick, onClose }: QueueRowItemLibraryPanelProps) {
    if (!open) return null;

    const filtered = filterLibraryForTargetZone(items, targetZone);
    const categories = libraryItemsByCategory(filtered);
    const zoneSections = filtered.filter((item) => item.kind === "zone");

    const panel = (
        <div className="pointer-events-auto fixed inset-0 z-[70] flex items-start justify-center bg-alloy-midnight/20 p-4 pt-16" role="dialog" aria-label="Add to queue row" data-queue-row-item-library onClick={onClose}>
            <div className="max-h-[min(70vh,560px)] w-full max-w-lg overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <header className="flex items-center justify-between border-b border-alloy-stone/10 px-4 py-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/40">Item library</p>
                        <p className="text-sm font-semibold text-alloy-midnight">{targetZone ? `Add to ${queueRowZoneLabel(targetZone)}` : "Choose a field or widget"}</p>
                        {!targetZone ? (
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Pick an item, then choose which row section it belongs in.</p>
                        ) : (
                            <p className="mt-0.5 text-[11px] text-alloy-pine/80">Placing in: {queueRowZoneLabel(targetZone)}</p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/40 hover:bg-alloy-stone/10" aria-label="Close library" data-library-close>✕</button>
                </header>
                <div className="max-h-[calc(min(70vh,560px)-3.5rem)] overflow-y-auto p-3">
                    {!targetZone && zoneSections.length > 0 ? (
                        <section className="mb-4 rounded-lg border border-alloy-pine/20 bg-alloy-pine/[0.04] p-3" data-library-placement-prompt>
                            <p className="text-[11px] font-medium text-alloy-midnight/70">Where should this go?</p>
                            <p className="mt-0.5 text-[10px] text-alloy-midnight/45">Click a row section on the canvas first, or add a section below.</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {zoneSections.map((z) => (
                                    <button key={z.zoneKey} type="button" onClick={() => onPick(z)} className="rounded-full border border-alloy-stone/20 bg-white px-3 py-1.5 text-[12px] font-medium hover:border-alloy-pine/40 hover:text-alloy-pine" data-library-zone={z.zoneKey}>+ {z.label}</button>
                                ))}
                            </div>
                        </section>
                    ) : null}
                    {categories.map((category) => (
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
                    ))}
                </div>
            </div>
        </div>
    );

    return typeof document === "undefined" ? panel : createPortal(panel, document.body);
}
