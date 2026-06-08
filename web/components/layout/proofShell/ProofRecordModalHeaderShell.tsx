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
    title: string;
    /** Location label next to title; null/undefined → muted "No location" chip. */
    locationLabel?: string | null;
    /** Status control (dropdown/pill) — proof-order, before BOS/actions. */
    statusControl?: ReactNode;
    /** Work with BOS + Actions cluster (close rendered separately when provided). */
    actionsControl?: ReactNode;
    closeButton?: ReactNode;
    /** Attention card body (row 2). */
    attention?: ReactNode | null;
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
    statusControl,
    actionsControl,
    closeButton,
    attention,
    tabs,
    activeTab,
    onTabSelect,
    lifecycleRail,
    dataAttribute = "proof-record-modal-header",
}: ProofRecordModalHeaderShellProps) {
    return (
        <div
            className="shrink-0 border-b border-solid"
            style={{ backgroundColor: "#FFFFFF", borderColor: PROOF_HEADER_BORDER }}
            data-proof-layout-header="true"
            data-proof-layout-header-variant={dataAttribute}
        >
            {/* row 1: title + location | status + actions + close */}
            <div
                className="flex items-start justify-between gap-4 px-6 pb-2 pt-4"
                data-proof-layout-header-row="title-actions"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2
                            id="admin-drawer-title"
                            className="break-words text-xl font-bold leading-snug"
                            style={{ color: PROOF_HEADER_TEXT }}
                        >
                            {title}
                        </h2>
                        {locationLabel ?
                            <span className="inline-flex items-center gap-1 rounded-full border border-alloy-stone/30 bg-alloy-stone/10 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/70">
                                <MapPin className="h-3 w-3" aria-hidden />
                                {locationLabel}
                            </span>
                        :   <span className="inline-flex items-center rounded-full border border-alloy-stone/20 bg-white px-2 py-0.5 text-[11px] text-alloy-midnight/40">
                                No location
                            </span>
                        }
                    </div>
                </div>
                <div
                    className="flex shrink-0 items-center gap-2"
                    data-proof-layout-header-controls="true"
                >
                    {statusControl}
                    {actionsControl}
                    {closeButton}
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
            <div className="px-6 pb-1" data-proof-layout-header-row="tabs">
                <div className="flex min-h-0 flex-wrap gap-0.5 rounded-lg border border-[rgba(0,0,0,0.14)] bg-white px-1.5 py-1.5">
                    {tabs.map((t) => {
                        const active = activeTab === t.key;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => onTabSelect(t.key)}
                                className={`rounded-md px-3 py-1.5 text-xs font-medium leading-snug transition-colors ${active ? "text-white shadow-sm" : "text-[#273F52]/80 hover:bg-[rgba(0,0,0,0.05)]"}`}
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
                <div className="px-6 pb-2" data-proof-layout-header-row="lifecycle">
                    {lifecycleRail}
                </div>
            :   null}
        </div>
    );
}
