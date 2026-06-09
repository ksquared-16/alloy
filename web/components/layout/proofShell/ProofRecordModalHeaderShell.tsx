"use client";

/**
 * Shared proof-layout modal header — source of truth for Layout Config + runtime drawer.
 *
 * Extracted from ProofRecordModal.tsx. Proof and live opportunity drawer both compose
 * this shell with their own status/actions/tab handlers.
 */

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

export const PROOF_HEADER_BORDER = "rgba(39,63,82,0.18)";
export const PROOF_HEADER_TEXT = "#273F52";
export const PROOF_HEADER_MIDNIGHT = "#273F52";

export const PROOF_DRAWER_TABS = ["overview", "communications", "notes", "documents", "activity"] as const;
export type ProofDrawerTab = (typeof PROOF_DRAWER_TABS)[number];

export type ProofHeaderTab = {
    key: string;
    label: string;
};

export type ProofRecordModalHeaderShellProps = {
    title: ReactNode;
    /** Location label next to title; omit chip entirely when `showLocationChip` is false. */
    locationLabel?: string | null;
    showLocationChip?: boolean;
    /** Secondary context under title (contact / household). */
    titleContext?: ReactNode;
    /** Lead command-center header — avatar + meta row. */
    commandCenter?: {
        avatar: ReactNode;
        metaRow?: ReactNode;
        contactRow?: ReactNode;
    };
    /** Tighter vertical rhythm for Lead drawer command center. */
    compactDensity?: boolean;
    /** Status control (dropdown/pill) — proof-order, before BOS/actions. */
    statusControl?: ReactNode;
    /** Work with BOS + Actions cluster (close rendered separately when provided). */
    actionsControl?: ReactNode;
    closeButton?: ReactNode;
    /** Attention card body (row 2). */
    attention?: ReactNode | null;
    /** Queue prev/next — nested under header controls, same row band as title. */
    queueNavigation?: ReactNode | null;
    tabs: readonly ProofHeaderTab[];
    activeTab: string;
    onTabSelect: (tab: string) => void;
    lifecycleRail?: ReactNode | null;
    /** Optional data attribute for runtime/tests. */
    dataAttribute?: string;
};

export default function ProofRecordModalHeaderShell({
    title,
    locationLabel,
    showLocationChip = true,
    titleContext,
    commandCenter,
    compactDensity = false,
    statusControl,
    actionsControl,
    closeButton,
    attention,
    queueNavigation,
    tabs,
    activeTab,
    onTabSelect,
    lifecycleRail,
    dataAttribute = "proof-record-modal-header",
}: ProofRecordModalHeaderShellProps) {
    const isOpportunityRuntime = dataAttribute === "opportunity-drawer-runtime";
    const titleClassName = isOpportunityRuntime ?
        "break-words text-[1.3rem] font-semibold leading-[1.08] tracking-tight sm:text-[1.4rem]"
    :   "break-words text-xl font-bold leading-snug";
    const titleRowPad = compactDensity ? "px-6 pb-1.5 pt-3.5" : "px-6 pb-2 pt-4";
    const tabsRowPad = compactDensity ? "px-6 pb-0 pt-0" : "px-6 pb-1";
    const lifecycleRowPad = compactDensity ? "px-6 pb-1.5 pt-0" : "px-6 pb-2";

    return (
        <div
            className="shrink-0 border-b border-solid"
            style={{ backgroundColor: "#FFFFFF", borderColor: PROOF_HEADER_BORDER }}
            data-proof-layout-header="true"
            data-proof-layout-header-variant={dataAttribute}
            {...(compactDensity ? { "data-lead-drawer-header-density": "compact" } : {})}
        >
            {/* row 1: title + location | status + actions + close */}
            <div
                className={`flex items-start justify-between gap-3 ${titleRowPad}`}
                data-proof-layout-header-row="title-actions"
            >
                <div className="min-w-0 flex-1">
                    {commandCenter ?
                        <div
                            className="flex min-w-0 items-start gap-3 rounded-xl border border-alloy-stone/10 bg-gradient-to-br from-white via-white to-alloy-stone/[0.03] px-3 py-2 shadow-[0_1px_3px_rgba(24,39,58,0.04)]"
                            data-lead-drawer-command-header="true"
                        >
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-alloy-juniper/15 bg-gradient-to-br from-alloy-juniper/[0.1] to-white text-alloy-juniper shadow-sm ring-1 ring-alloy-stone/10"
                                data-lead-drawer-command-avatar="true"
                            >
                                {commandCenter.avatar}
                            </div>
                            <div className="min-w-0 flex-1 border-l border-alloy-stone/10 pl-3">
                                {typeof title === "string" ?
                                    <h2
                                        id="admin-drawer-title"
                                        className={titleClassName}
                                        style={{ color: PROOF_HEADER_TEXT }}
                                    >
                                        {title}
                                    </h2>
                                :   <div
                                        id="admin-drawer-title"
                                        className={titleClassName}
                                        style={{ color: PROOF_HEADER_TEXT }}
                                    >
                                        {title}
                                    </div>
                                }
                                {commandCenter.metaRow ?
                                    <p
                                        className="mt-0.5 truncate text-[11px] leading-snug text-alloy-midnight/55 sm:whitespace-normal sm:overflow-visible"
                                        data-lead-drawer-header-meta-row="true"
                                    >
                                        {commandCenter.metaRow}
                                    </p>
                                :   null}
                                {commandCenter.contactRow ?
                                    <p
                                        className="mt-0.5 hidden truncate text-[11px] leading-snug text-alloy-midnight/40 lg:block"
                                        data-lead-drawer-header-contact-row="true"
                                    >
                                        {commandCenter.contactRow}
                                    </p>
                                :   null}
                            </div>
                        </div>
                    :   <>
                        <div className="flex flex-wrap items-center gap-2">
                            {typeof title === "string" ?
                                <h2
                                    id="admin-drawer-title"
                                    className={titleClassName}
                                    style={{ color: PROOF_HEADER_TEXT }}
                                >
                                    {title}
                                </h2>
                            :   <div
                                    id="admin-drawer-title"
                                    className={titleClassName}
                                    style={{ color: PROOF_HEADER_TEXT }}
                                >
                                    {title}
                                </div>
                            }
                            {showLocationChip ?
                                locationLabel ?
                                    <span className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/25 bg-alloy-stone/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-alloy-midnight/70">
                                        <MapPin className="h-3 w-3 text-alloy-midnight/45" aria-hidden />
                                        {locationLabel}
                                    </span>
                                :   <span className="inline-flex items-center rounded-full border border-alloy-stone/20 bg-white px-2.5 py-0.5 text-[11px] text-alloy-midnight/40">
                                        No location
                                    </span>
                            :   null}
                        </div>
                        {titleContext ?
                            <div
                                className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-snug text-alloy-midnight/60"
                                data-proof-layout-header-context="true"
                            >
                                {titleContext}
                            </div>
                        :   null}
                    </>
                    }
                </div>
                <div
                    className="flex shrink-0 flex-col items-end gap-1"
                    data-proof-layout-header-controls="true"
                >
                    <div className="flex items-center gap-2">
                        {actionsControl}
                        {statusControl}
                        {closeButton}
                    </div>
                    {queueNavigation ?
                        <div data-proof-layout-header-queue-navigation="true">
                            {queueNavigation}
                        </div>
                    :   null}
                </div>
            </div>

            {/* row 2: attention */}
            {attention ?
                <div className="px-6 pb-2" data-proof-layout-header-row="attention">
                    <div className="w-full rounded-xl border-l-[3px] border-l-[rgba(0,69,140,0.5)] bg-gradient-to-br from-white via-white to-[rgba(0,0,0,0.06)] px-2.5 py-1.5 ring-1 ring-[rgba(39,63,82,0.06)]">
                        {attention}
                    </div>
                </div>
            :   null}

            {/* row 3: tabs */}
            <div className={tabsRowPad} data-proof-layout-header-row="tabs">
                <div className={`flex min-h-0 flex-wrap gap-0.5 ${compactDensity ? "border-b border-alloy-stone/12 pb-0.5" : "rounded-lg border border-[rgba(0,0,0,0.14)] bg-white px-1.5 py-1.5"}`}>
                    {tabs.map((t) => {
                        const active = activeTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => onTabSelect(t.key)}
                                className={`rounded-md px-3 py-1 text-xs font-medium leading-snug transition-colors ${active ? "text-white shadow-sm" : "text-[#273F52]/80 hover:bg-[rgba(0,0,0,0.04)] hover:underline hover:decoration-[rgba(0,162,131,0.55)] hover:underline-offset-[3px]"}`}
                                style={
                                    active ?
                                        { backgroundColor: PROOF_HEADER_MIDNIGHT, borderBottom: "2px solid rgba(0,162,131,0.45)" }
                                    :   undefined
                                }
                                data-opportunity-drawer-tab={t.key}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* row 4: lifecycle rail */}
            {lifecycleRail ?
                <div className={lifecycleRowPad} data-proof-layout-header-row="lifecycle">
                    {lifecycleRail}
                </div>
            :   null}
        </div>
    );
}
