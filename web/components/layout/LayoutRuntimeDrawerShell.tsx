"use client";

/**
 * LayoutRuntimeDrawerShell — the Layout Runtime-owned visible drawer shell.
 *
 * Owns the VISIBLE header structure following the proof/config header doctrine
 * (title + location pill · status · Work-with-BOS/Actions · close; attention band;
 * tab strip; lifecycle rail) plus the scrolling body. The VM is NOT the visible
 * shell — it only supplies the slot CONTENTS (status control, action menus/BOS,
 * lifecycle model, attention, tab list, body) as data/action providers.
 *
 * Rendered inside a `chromeless` Drawer (frame only), so this shell owns everything
 * the operator sees. Existing tabs (Communications/Notes/…) keep their VM/legacy
 * panes as the body for that tab while the shell remains Layout Runtime-owned.
 */

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import clsx from "clsx";

export type LayoutRuntimeDrawerTab = { key: string; label: string };

export type LayoutRuntimeDrawerShellProps = {
    /** Record title (h2, labels the dialog). */
    title: ReactNode;
    /** Location label for the header pill (VM-supplied). */
    location?: string | null;
    onClose: () => void;
    /** Status control (e.g. VmProgressiveStatusDropdown) — VM behavior. */
    statusSlot?: ReactNode;
    /** Work-with-BOS + Actions menu (e.g. OpportunityDrawerHeaderControls) — VM behavior. */
    actionsSlot?: ReactNode;
    /** Attention band content (VM-supplied), shown under the title row. */
    attentionSlot?: ReactNode;
    tabs: LayoutRuntimeDrawerTab[];
    activeTab: string;
    onSelectTab: (key: string) => void;
    /** Lifecycle rail (e.g. RecordLifecycleRail) — VM-supplied model. */
    lifecycleSlot?: ReactNode;
    /** Non-visual background work (e.g. communications preloader). */
    backgroundSlot?: ReactNode;
    /** Active tab body (LayoutDoc runtime body for overview; VM/legacy panes otherwise). */
    children: ReactNode;
    /** Surface key for diagnostics. */
    surface?: string;
};

export default function LayoutRuntimeDrawerShell({
    title,
    location,
    onClose,
    statusSlot,
    actionsSlot,
    attentionSlot,
    tabs,
    activeTab,
    onSelectTab,
    lifecycleSlot,
    backgroundSlot,
    children,
    surface,
}: LayoutRuntimeDrawerShellProps) {
    const locationLabel = typeof location === "string" ? location.trim() : "";

    return (
        <div
            className="flex min-h-0 flex-1 flex-col bg-white"
            data-layout-runtime-drawer-shell="true"
            data-layout-runtime-drawer-surface={surface ?? ""}
        >
            {/* ── Sticky header (proof/config doctrine) ───────────────────────── */}
            <div className="shrink-0 border-b border-alloy-stone/20 bg-white" data-layout-runtime-drawer-header="true">
                {/* row 1: title + location · status · actions · close */}
                <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2
                                id="admin-drawer-title"
                                className="break-words text-xl font-bold leading-snug text-alloy-midnight"
                            >
                                {title}
                            </h2>
                            {locationLabel ? (
                                <span
                                    className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/30 bg-alloy-stone/10 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/70"
                                    data-layout-runtime-drawer-location="true"
                                >
                                    <MapPin className="h-3 w-3" aria-hidden /> {locationLabel}
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full border border-alloy-stone/20 bg-white px-2 py-0.5 text-[11px] text-alloy-midnight/40">
                                    No location
                                </span>
                            )}
                        </div>
                        {statusSlot ? (
                            <div className="mt-0.5" data-layout-runtime-drawer-status="true">
                                {statusSlot}
                            </div>
                        ) : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-2" data-layout-runtime-drawer-actions="true">
                        {actionsSlot}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="rounded-md p-1.5 text-alloy-midnight/70 transition-colors hover:bg-alloy-stone/10"
                        >
                            <span className="text-2xl leading-none">×</span>
                        </button>
                    </div>
                </div>

                {/* row 2: attention band */}
                {attentionSlot ? (
                    <div className="px-6 pb-2" data-layout-runtime-drawer-attention="true">
                        {attentionSlot}
                    </div>
                ) : null}

                {/* row 3: tab strip */}
                <div className="px-6 pb-1" data-layout-runtime-drawer-tab-strip="true">
                    <div className="flex min-h-0 flex-wrap gap-0.5 rounded-lg border border-alloy-stone/20 bg-white px-1.5 py-1.5">
                        {tabs.map((tab) => {
                            const active = tab.key === activeTab;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => onSelectTab(tab.key)}
                                    className={clsx(
                                        "rounded-md px-3 py-1.5 text-xs font-semibold leading-snug transition-colors",
                                        active
                                            ? "bg-alloy-midnight text-white shadow-sm"
                                            : "text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                    )}
                                    data-layout-runtime-drawer-tab={tab.key}
                                    aria-current={active ? "page" : undefined}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* row 4: lifecycle rail */}
                {lifecycleSlot ? (
                    <div className="px-6 pb-2" data-layout-runtime-drawer-lifecycle-rail-wrap="true">
                        {lifecycleSlot}
                    </div>
                ) : null}
            </div>

            {backgroundSlot}

            {/* ── Scroll body (active tab) ────────────────────────────────────── */}
            <div
                className="min-h-0 flex-1 overflow-y-auto p-6 [scrollbar-gutter:stable]"
                data-layout-runtime-drawer-scroll="true"
            >
                {children}
            </div>
        </div>
    );
}
