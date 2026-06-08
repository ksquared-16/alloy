"use client";

/**
 * PROOF-ONLY record modal. Mirrors Alloy's CURRENT go-forward drawer pattern:
 * a CENTER MODAL pop-up (not the legacy right-side drawer). Visual reference:
 * web/components/admin/Drawer.tsx `presentation="modal"` — centered overlay,
 * large rounded-2xl panel (up to ~80rem / max-w-5xl), backdrop blur, sticky
 * header (title/status/actions), tab strip, lifecycle rail, scrollable body.
 *
 * Uses only Alloy token values + lucide. Imports NO live drawer/VM/runtime
 * components. Mutation affordances (status, actions) are disabled / simulated.
 */

import { useState, type ReactNode } from "react";
import { MoreHorizontal, Sparkles, X } from "lucide-react";
import ProofRecordModalHeaderShell, {
    PROOF_DRAWER_TABS,
    type ProofDrawerTab,
} from "./ProofRecordModalHeaderShell";
import ProofLifecycleRail from "./ProofLifecycleRail";

export { PROOF_DRAWER_TABS, type ProofDrawerTab };

const TAB_LABELS: Record<ProofDrawerTab, string> = {
    overview: "Overview",
    communications: "Communications",
    notes: "Notes",
    documents: "Documents",
    activity: "Activity",
};

const BORDER = "rgba(39,63,82,0.18)";
const TEXT = "#273F52";
const MUTED = "rgba(39,63,82,0.65)";
const SURFACE = "#FFFFFF";
const BODY_BG = "#F6F8FC";

export default function ProofRecordModal({
    open,
    onClose,
    title,
    location,
    statusLabel,
    attention,
    lifecycleStatusKey,
    children,
    footer,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    location?: string | null;
    statusLabel?: string;
    attention?: string | null;
    lifecycleStatusKey?: string | null;
    children: ReactNode;
    footer?: ReactNode;
}) {
    const [tab, setTab] = useState<ProofDrawerTab>("overview");
    if (!open) return null;

    const statusControl = (
        <label className="inline-flex min-w-0 items-center gap-1.5" title="Status (simulated — read-only in proof)">
            <select disabled value="cur" className="max-w-[12rem] truncate rounded-md border border-[rgba(0,0,0,0.14)] bg-white px-2 py-1 text-xs font-medium text-[rgba(39,63,82,0.85)] disabled:opacity-80">
                <option value="cur">{statusLabel || "—"}</option>
            </select>
        </label>
    );

    const actionsControl = (
        <>
            <button type="button" disabled title="Work with BOS (simulated)" className="inline-flex items-center gap-1 rounded-md border border-[rgba(0,69,140,0.35)] bg-[#f5f8ff] px-2 py-1 text-xs font-medium text-[#00458C] disabled:opacity-90">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Work with BOS
            </button>
            <button type="button" disabled title="Actions (simulated)" className="inline-flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.14)] bg-white px-2 py-1 text-xs font-medium text-[rgba(39,63,82,0.75)] disabled:opacity-90">
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden /> Actions
            </button>
        </>
    );

    const closeButton = (
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-[rgba(39,63,82,0.7)] hover:bg-[rgba(0,0,0,0.05)]">
            <X className="h-4 w-4" aria-hidden />
        </button>
    );

    return (
        <>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" style={{ zIndex: 40 }} aria-hidden onClick={onClose} />
            <div className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-6" style={{ zIndex: 50 }} onClick={onClose}>
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    onClick={(e) => e.stopPropagation()}
                    className="my-auto flex max-h-[min(860px,calc(100dvh-3rem))] w-[min(calc(100vw-1.5rem),80rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl"
                    style={{ backgroundColor: SURFACE, color: TEXT, borderColor: BORDER }}
                >
                    <ProofRecordModalHeaderShell
                        title={title}
                        locationLabel={location}
                        statusControl={statusControl}
                        actionsControl={actionsControl}
                        closeButton={closeButton}
                        attention={
                            attention ?
                                <p className="line-clamp-2 text-left text-[11px] font-medium leading-snug" style={{ color: TEXT }}>{attention}</p>
                            :   null
                        }
                        tabs={PROOF_DRAWER_TABS.map((key) => ({ key, label: TAB_LABELS[key] }))}
                        activeTab={tab}
                        onTabSelect={(t) => setTab(t as ProofDrawerTab)}
                        lifecycleRail={<ProofLifecycleRail statusKey={lifecycleStatusKey} />}
                        dataAttribute="proof-record-modal"
                    />

                    <div className="min-h-0 flex-1 overflow-y-auto p-6" style={{ backgroundColor: BODY_BG }} data-proof-record-modal-scroll>
                        {tab === "overview" ?
                            children
                        :   <div className="rounded-lg border border-dashed border-[rgba(39,63,82,0.2)] bg-white p-6 text-center text-sm" style={{ color: MUTED }}>
                                <div className="font-medium" style={{ color: TEXT }}>{TAB_LABELS[tab as ProofDrawerTab]}</div>
                                <p className="mt-1">Not part of this layout proof. Layout V2 configures the Overview body; other tabs are live-runtime only.</p>
                            </div>
                        }
                    </div>

                    {footer ?
                        <div className="shrink-0 border-t px-6 py-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>{footer}</div>
                    :   null}
                </div>
            </div>
        </>
    );
}
