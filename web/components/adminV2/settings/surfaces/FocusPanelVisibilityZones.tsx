"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import {
    partitionSummaryCardsByVisibility,
    setSummaryCardVisibility,
    type FocusPanelCardVisibility,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import { entryInstanceId, type SummaryCardOrderEntry } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";

type Props = {
    order: SummaryCardOrderEntry[];
    onChange: (next: SummaryCardOrderEntry[]) => void;
};

/**
 * Compact Visible / Linked dropdown overlays — collapsed by default so the
 * composer canvas keeps vertical room. One card identity; move preserves config.
 */
export default function FocusPanelVisibilityZones({ order, onChange }: Props) {
    const { visible, linked } = partitionSummaryCardsByVisibility(order);

    const move = (instanceId: string, visibility: FocusPanelCardVisibility) => {
        onChange(setSummaryCardVisibility(order, instanceId, visibility) as SummaryCardOrderEntry[]);
    };

    return (
        <div className="flex flex-wrap items-start gap-2" data-fp-visibility-zones="true">
            <ZoneDropdown
                zone="visible"
                title="Visible Cards"
                count={visible.length}
                hint="Initial Focus Panel composition"
                entries={visible}
                empty="No visible cards — add from the canvas or library."
                actionLabel="Move to Linked"
                onAction={(id) => move(id, "linked")}
            />
            <ZoneDropdown
                zone="linked"
                title="Linked Cards"
                count={linked.length}
                hint="Configured & navigable — not in initial layout"
                entries={linked}
                empty="No linked cards — move a Visible card here."
                actionLabel="Move to Visible"
                onAction={(id) => move(id, "visible")}
            />
        </div>
    );
}

function ZoneDropdown({
    zone,
    title,
    count,
    hint,
    entries,
    empty,
    actionLabel,
    onAction,
}: {
    zone: "visible" | "linked";
    title: string;
    count: number;
    hint: string;
    entries: SummaryCardOrderEntry[];
    empty: string;
    actionLabel: string;
    onAction: (instanceId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return;
        const onDoc = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative" data-fp-visibility-zone={zone}>
            <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-alloy-forge/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-alloy-midnight shadow-sm hover:border-alloy-bend-pine/40"
                aria-expanded={open}
                aria-controls={menuId}
                data-fp-visibility-trigger={zone}
                onClick={() => setOpen((v) => !v)}
            >
                <span>{title}</span>
                <span className="rounded-full bg-alloy-midnight/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-alloy-midnight/70">
                    {count}
                </span>
                <ChevronDown
                    className={`h-3.5 w-3.5 text-alloy-midnight/45 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>

            {open ?
                <div
                    id={menuId}
                    role="menu"
                    className="absolute left-0 top-[calc(100%+6px)] z-40 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-alloy-forge/15 bg-white p-2 shadow-lg"
                    data-fp-visibility-menu={zone}
                >
                    <p className="mb-2 px-1 text-[10px] text-alloy-midnight/50">{hint}</p>
                    {entries.length === 0 ?
                        <p className="px-1 py-2 text-[10px] text-alloy-midnight/40">{empty}</p>
                    :   <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                            {entries.map((entry) => {
                                const id = entryInstanceId(entry);
                                return (
                                    <li
                                        key={id}
                                        className="flex items-center justify-between gap-2 rounded border border-alloy-forge/10 px-2 py-1.5"
                                        data-fp-visibility-card={entry.key}
                                        role="menuitem"
                                    >
                                        <span className="min-w-0 truncate text-[11px] font-medium text-alloy-midnight">
                                            {focusPanelCardCatalogLabel(entry.key)}
                                        </span>
                                        <button
                                            type="button"
                                            className="shrink-0 text-[10px] font-semibold text-alloy-bend-pine hover:underline"
                                            onClick={() => {
                                                onAction(id);
                                            }}
                                        >
                                            {actionLabel}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    }
                </div>
            :   null}
        </div>
    );
}
